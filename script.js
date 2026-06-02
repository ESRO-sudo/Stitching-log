if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log("SW Error:", err));
}

// FREE SECURE CLOUD DATABASE CONNECTOR
const firebaseConfig = { 
    databaseURL: "https://silai-app-default-rtdb.firebaseio.com/" 
};
if (!firebase.apps.length) { 
    firebase.initializeApp(firebaseConfig); 
}
const database = firebase.database();

// DOM Elements
const mainApp = document.getElementById('mainApp');
const entryDateInput = document.getElementById('entryDate');
const activityInput = document.getElementById('activity');
const itemSizeInput = document.getElementById('itemSize');
const quantityInput = document.getElementById('quantity');
const rateInput = document.getElementById('rate');
const reportMonthFilter = document.getElementById('reportMonthFilter');

const filterFromDate = document.getElementById('filterFromDate');
const filterToDate = document.getElementById('filterToDate');
const applyCustomFilterBtn = document.getElementById('applyCustomFilterBtn');
const downloadCustomExcelBtn = document.getElementById('downloadCustomExcelBtn');
const resetFilterBtn = document.getElementById('resetFilterBtn');

const salaryBoxLabel = document.getElementById('salaryBoxLabel');
const listTitleLabel = document.getElementById('listTitleLabel');
const saveEntryBtn = document.getElementById('saveEntryBtn');
const todayTableBody = document.querySelector('#todayTable tbody');

// Backup Account Elements
const backupUserIdInput = document.getElementById('backupUserIdInput');
const saveBackupUserBtn = document.getElementById('saveBackupUserBtn');
const backupStatusText = document.getElementById('backupStatusText');

// Scanner Elements
const imageScannerInput = document.getElementById('imageScannerInput');
const ocrStatus = document.getElementById('ocrStatus');

let currentViewMode = "today"; 
let userUniqueId = "";
let cloudDataRef = null;

document.addEventListener('DOMContentLoaded', () => {
    const todayStr = getLocalDateString();
    entryDateInput.value = todayStr;
    filterFromDate.value = todayStr;
    filterToDate.value = todayStr;

    // Load Existing Backup Account if saved
    const savedUserId = localStorage.getItem('userUniqueId');
    if (savedUserId) {
        userUniqueId = savedUserId;
        backupUserIdInput.value = userUniqueId;
        backupStatusText.innerText = `✅ क्लाउड बैकअप चालू है: अकाउंट (${userUniqueId})`;
        backupStatusText.style.color = "#27ae60";
        syncDataFromCloud(userUniqueId);
    } else {
        backupStatusText.innerText = "⚠️ चेतावनी: बैकअप अकाउंट लिंक नहीं है! फोन रीसेट होने पर डेटा डिलीट हो जाएगा।";
        backupStatusText.style.color = "#c0392b";
        updateTable();
    }

    if (!localStorage.getItem('allEntries')) {
        localStorage.setItem('allEntries', JSON.stringify([]));
    }

    setupMonthFilterOptions();

    // Bind Backup Account Button
    saveBackupUserBtn.addEventListener('click', () => {
        const rawInput = backupUserIdInput.value.trim().replace(/[^a-zA-Z0-9]/g, '_'); 
        if(!rawInput || rawInput.length < 3) {
            alert("कृपया सही नाम या मोबाइल नंबर डालें (कम से कम 3 अक्षर)!");
            return;
        }
        
        if (confirm(`क्या आप इस ऐप को '${rawInput}' अकाउंट से जोड़ना चाहते हैं?`)) {
            userUniqueId = rawInput;
            localStorage.setItem('userUniqueId', userUniqueId);
            backupStatusText.innerText = `✅ क्लाउड बैकअप चालू है: अकाउंट (${userUniqueId})`;
            backupStatusText.style.color = "#27ae60";
            alert("अकाउंट सफलतापूर्वक लिंक हो गया! पुराना क्लाउड डेटा लोड हो रहा है...");
            syncDataFromCloud(userUniqueId);
        }
    });

    entryDateInput.addEventListener('change', () => {
        currentViewMode = "today";
        updateTable();
    });
    reportMonthFilter.addEventListener('change', () => {
        currentViewMode = "month";
        updateTable();
    });

    // IMAGE SCANNER (OCR ENGINE)
    imageScannerInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        ocrStatus.innerText = "⏳ पर्ची को स्कैन किया जा रहा है... कृपया रुकें...";
        ocrStatus.style.color = "#e67e22";

        const reader = new FileReader();
        reader.onload = function() {
            Tesseract.recognize(
                reader.result,
                'eng', 
                { logger: m => console.log(m) }
            ).then(({ data: { text } }) => {
                processScannedText(text);
            }).catch(err => {
                console.error(err);
                ocrStatus.innerText = "❌ फोटो धुंधली है, कृपया साफ फोटो अपलोड करें।";
                ocrStatus.style.color = "#e74c3c";
            });
        };
        reader.readAsDataURL(file);
    });
});

// SMART TEXT PARSER FOR AUTOMATIC COLS FILL
function processScannedText(text) {
    if (!text || text.trim() === "") {
        ocrStatus.innerText = "❌ पर्ची खाली या अस्पष्ट है।";
        ocrStatus.style.color = "#e74c3c";
        return;
    }

    const lines = text.split('\n');
    let sizeFound = "";
    let qtyFound = "";
    let rateFound = "";
    let dateFound = "";

    // 1. DATE DETECTOR (तारीख ढूँढने का लॉजिक - DD-MM-YYYY या DD/MM/YY)
    const dateRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;
    const dateMatch = text.match(dateRegex);
    if (dateMatch) {
        let day = dateMatch[1].padStart(2, '0');
        let month = dateMatch[2].padStart(2, '0');
        let year = dateMatch[3];
        
        // अगर साल सिर्फ 2 अंकों का है (जैसे 26), तो उसे 2026 बनाएं
        if (year.length === 2) {
            year = "20" + year;
        }
        
        // इनपुट टाइप डेट के लिए फॉर्मेट YYYY-MM-DD होना चाहिए
        dateFound = `${year}-${month}-${day}`;
        entryDateInput.value = dateFound;
    }

    // 2. SIZE FINDER
    const sizeRegex = /(\d{2,3}[\*xX]\d{2,3})/;
    const sizeMatch = text.match(sizeRegex);
    if (sizeMatch) {
        sizeFound = sizeMatch[1].replace('x', '*').replace('X', '*');
        itemSizeInput.value = sizeFound;
    }

    // 3. QTY AND RATE FINDER
    lines.forEach(line => {
        const cleanLine = line.replace(/\s+/g, ' ').toUpperCase();
        if (cleanLine.includes("PCS") || cleanLine.includes("QTY") || cleanLine.includes("TOTAL") || cleanLine.includes("PCE")) {
            const match = cleanLine.match(/(\d+)/);
            if (match && !qtyFound) qtyFound = match[1];
        }
        if (cleanLine.includes("RATE") || cleanLine.includes("RS") || cleanLine.includes("PRICE") || cleanLine.includes("@")) {
            const match = cleanLine.match(/(\d+(\.\d{1,2})?)/);
            if (match && !rateFound) rateFound = match[1];
        }
    });

    if (!qtyFound || !rateFound) {
        const allNumbers = text.match(/\b\d+(\.\d+)?\b/g);
        if (allNumbers) {
            allNumbers.forEach(num => {
                if (!num.includes("*") && !num.includes("x")) {
                    const val = parseFloat(num);
                    if (val > 100 && !qtyFound) {
                        qtyFound = num;
                    } else if (val < 100 && val > 0 && !rateFound) {
                        rateFound = num;
                    }
                }
            });
        }
    }

    if (qtyFound) quantityInput.value = qtyFound;
    if (rateFound) rateInput.value = rateFound;

    // रिजल्ट मैसेज अपडेट करना
    if (dateFound || sizeFound || qtyFound || rateFound) {
        let successMsg = "✅ ऑटो-फ़िल हुआ:";
        if (dateFound) successMsg += " तारीख 📅 ";
        if (sizeFound) successMsg += " साइज 📐 ";
        if (qtyFound) successMsg += " मात्रा 📊 ";
        ocrStatus.innerText = successMsg;
        ocrStatus.style.color = "#27ae60";
    } else {
        ocrStatus.innerText = "⚠️ पर्ची पढ़ी गई पर डेटा मैच नहीं हुआ, कृपया हाथ से भरें।";
        ocrStatus.style.color = "#e67e22";
    }
    
    // तारीख बदलने के बाद टेबल को तुरंत रिफ्रेश करें
    currentViewMode = "today";
    updateTable();
}

function getLocalDateString() {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    return new Date(today.getTime() - (offset * 60 * 1000)).toISOString().split('T')[0];
}

menuBtn.addEventListener('click', (e) => { e.stopPropagation(); dropdownMenu.classList.toggle('hidden'); });
document.addEventListener('click', () => dropdownMenu.classList.add('hidden'));

applyCustomFilterBtn.addEventListener('click', () => { currentViewMode = "custom"; updateTable(); });
resetFilterBtn.addEventListener('click', () => { entryDateInput.value = getLocalDateString(); currentViewMode = "today"; updateTable(); });

// FIREBASE REALTIME SYNC (FOR CLOUD BACKUP)
function syncDataFromCloud(userId) {
    if(!userId) return;
    if(cloudDataRef) cloudDataRef.off(); 
    
    cloudDataRef = database.ref('auto_users/' + userId + '/entries');
    cloudDataRef.on('value', (snapshot) => {
        const cloudData = [];
        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                let item = childSnapshot.val();
                item.id = childSnapshot.key;
                cloudData.push(item);
            });
            localStorage.setItem('allEntries', JSON.stringify(cloudData));
        } else {
            localStorage.setItem('allEntries', JSON.stringify([]));
        }
        updateTable();
    });
}

function getSalaryMonthGroup(dateString) {
    if (!dateString) return '';
    const parts = dateString.split('-');
    const year = parseInt(parts[0]); const month = parseInt(parts[1]); const day = parseInt(parts[2]);
    const monthsList = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (day >= 26) {
        let nextMonth = month + 1; let nextYear = year;
        if (nextMonth > 12) { nextMonth = 1; nextYear = year + 1; }
        return `${monthsList[nextMonth - 1]}-${nextYear.toString().slice(-2)}`;
    } else { return `${monthsList[month - 1]}-${year.toString().slice(-2)}`; }
}

function setupMonthFilterOptions() {
    const monthsList = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const currentYear = new Date().getFullYear();
    reportMonthFilter.innerHTML = '';
    for (let y = currentYear - 1; y <= currentYear + 1; y++) {
        for (let m = 0; m < 12; m++) {
            const optionValue = `${monthsList[m]}-${y.toString().slice(-2)}`;
            const option = document.createElement('option');
            option.value = optionValue;
            option.innerText = `${monthsList[m]} 20${y.toString().slice(-2)}`;
            reportMonthFilter.appendChild(option);
        }
    }
    reportMonthFilter.value = getSalaryMonthGroup(getLocalDateString());
}

// PERMANENT FIREBASE SAVE ENGINE
saveEntryBtn.addEventListener('click', () => {
    if (!userUniqueId) {
        alert("❌ डेटा सेव नहीं हो सकता! कृपया पहले ऊपर अपना नाम/मोबाइल नंबर डालकर बैकअप अकाउंट लिंक करें।");
        return;
    }

    const activity = activityInput.value;
    const size = itemSizeInput.value.trim();
    const qty = parseFloat(quantityInput.value) || 0;
    const rate = parseFloat(rateInput.value) || 0;
    const rawDate = entryDateInput.value;

    if (!size || qty <= 0 || rate < 0 || !rawDate) { alert("कृपया सभी फील्ड सही से भरें!"); return; }

    const totalRate = parseFloat((qty * rate).toFixed(2));
    const salaryMonth = getSalaryMonthGroup(rawDate);
    
    const newEntryRef = database.ref('auto_users/' + userUniqueId + '/entries').push();
    
    const newEntry = {
        id: newEntryRef.key,
        rawDate: rawDate, 
        date: formatDateDisplay(rawDate),
        salaryMonth: salaryMonth,
        activity: activity,
        size: size,
        qty: qty,
        rate: rate,
        total: totalRate
    };

    newEntryRef.set(newEntry).then(() => {
        alert("डेटा सुरक्षित रूप से क्लाउड पर परमानेंट सेव हो गया है! ✅");
    }).catch((err) => {
        console.log("Cloud error, saving locally:", err);
        let allEntries = JSON.parse(localStorage.getItem('allEntries')) || [];
        allEntries.push(newEntry);
        localStorage.setItem('allEntries', JSON.stringify(allEntries));
        updateTable();
    });

    itemSizeInput.value = ''; quantityInput.value = ''; rateInput.value = '';
    imageScannerInput.value = ''; 
    ocrStatus.innerText = "फोटो अपलोड करते ही डेटा अपने आप भर जाएगा।";
    ocrStatus.style.color = "#7f8c8d";
    currentViewMode = "today";
});

window.deleteEntry = function(entryId) {
    if (!userUniqueId) return;
    if (confirm("क्या आप सच में इस एंट्री को डिलीट करना चाहते हैं?")) {
        database.ref('auto_users/' + userUniqueId + '/entries/' + entryId).remove().then(() => {
            alert("एंट्री डिलीट हो गई!");
        });
    }
}

function updateTable() {
    todayTableBody.innerHTML = '';
    let allEntries = JSON.parse(localStorage.getItem('allEntries')) || [];
    let filteredEntries = [];

    if (currentViewMode === "today") {
        const d = entryDateInput.value;
        filteredEntries = allEntries.filter(item => item.rawDate === d);
        salaryBoxLabel.innerText = "चुनी हुई तारीख की कुल कमाई:";
        listTitleLabel.innerText = "आज का डेटा लिस्ट (Today's History)";
        filteredEntries.sort((a,b) => new Date(b.rawDate) - new Date(a.rawDate));
        renderTableRows(filteredEntries, true);
    } else {
        if (currentViewMode === "month") {
            const m = reportMonthFilter.value;
            filteredEntries = allEntries.filter(item => item.salaryMonth === m);
            salaryBoxLabel.innerText = `महीने (${m}) की कुल कमाई (26-25 चक्र):`;
            listTitleLabel.innerText = `महीने (${m}) का कुल मर्ज चार्ट (Salary Slip)`;
        } else if (currentViewMode === "custom") {
            const start = filterFromDate.value; const end = filterToDate.value;
            filteredEntries = allEntries.filter(item => item.rawDate >= start && item.rawDate <= end);
            salaryBoxLabel.innerText = "कस्टम तारीखों की कुल कमाई:";
            listTitleLabel.innerText = "कस्टम डेट रेंज का मर्ज चार्ट";
        }

        const mergedMap = {};
        filteredEntries.forEach(item => {
            const key = `${item.size}_${item.rate}`;
            if (!mergedMap[key]) {
                mergedMap[key] = { date: item.date, size: item.size, qty: 0, rate: item.rate, total: 0 };
            }
            mergedMap[key].qty += item.qty;
            mergedMap[key].total = parseFloat((mergedMap[key].total + item.total).toFixed(2));
        });

        renderTableRows(Object.values(mergedMap), false);
    }

    let totalSum = 0;
    filteredEntries.forEach(item => totalSum += item.total);
    document.getElementById('grandTotalSalary').innerText = `₹${totalSum.toFixed(2)}`;
}

function renderTableRows(list, showDelete) {
    list.forEach(item => {
        let actionButton = showDelete 
            ? `<button onclick="deleteEntry('${item.id}')" style="background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:12px;">❌</button>`
            : `<span style="color:#7f8c8d; font-size:11px;">Merged</span>`;

        const row = `<tr>
            <td>${item.date || "Data"}</td>
            <td>${item.size || 'N/A'}</td>
            <td><b>${item.qty || 0}</b> Pcs</td>
            <td>₹${item.rate || 0}</td>
            <td style="font-weight: bold; color: #27ae60;">₹${item.total || 0}</td>
            <td>${actionButton}</td>
        </tr>`;
        todayTableBody.innerHTML += row;
    });
}

function formatDateDisplay(dateString) {
    if(!dateString) return '';
    const parts = dateString.split('-');
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${parts[2]}-${months[parseInt(parts[1]) - 1]}`;
}
