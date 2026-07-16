const CORRECT_PASSWORD = "admin";
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzmkOlPi5jmPVKXW0ThC7a2muiwNOWKQpZUG94quK5d6i1V0nC22H_-i7KBJG9p_8z9ZQ/exec";
let productDatabase = [];
let cart = [];
let modalTimeout = null;
let modalInterval = null;

function checkPassword() {
    const userInput = document.getElementById('pass-input').value;
    const errorMsg = document.getElementById('error-message');
    
    if (userInput === CORRECT_PASSWORD) {
        sessionStorage.setItem("pos_authenticated", "true");
        unlockScreen();
        fetchProducts();
        initBackgroundSync();
    } else {
        errorMsg.style.display = 'block';
        document.getElementById('pass-input').value = '';
    }
}

document.getElementById('pass-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkPassword();
});

function unlockScreen() {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
}

window.onload = function() {
    if (sessionStorage.getItem("pos_authenticated") === "true") {
        unlockScreen();
        fetchProducts();
        initBackgroundSync();
    }
};

async function fetchProducts() {
    try {
        const response = await fetch(WEB_APP_URL);
        productDatabase = await response.json();
    } catch (error) {
        console.log("Error loading product database.");
    }
}

const searchInput = document.getElementById('search-input');
const suggestionsBox = document.getElementById('suggestions');

searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase().trim();
    suggestionsBox.innerHTML = '';
    if (!query) { suggestionsBox.style.display = 'none'; return; }
    
    const barcodeMatch = productDatabase.find(p => p.barcode && p.barcode.toString() === query);
    if (barcodeMatch) {
        addToCart(barcodeMatch);
        searchInput.value = '';
        suggestionsBox.style.display = 'none';
        searchInput.focus();
        return;
    }
    
    let filtered = productDatabase.filter(p => 
        p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query)
    );
    
    filtered.sort((a, b) => {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();
        const aStartsWith = nameA.startsWith(query);
        const bStartsWith = nameB.startsWith(query);
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        return nameA.localeCompare(nameB);
    });
    
    if (filtered.length > 0) {
        filtered.forEach(prod => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerText = `${prod.name} (${prod.sku}) - ৳${parseFloat(prod.price).toFixed(2)}`;
            div.onclick = () => {
                addToCart(prod);
                searchInput.value = '';
                suggestionsBox.style.display = 'none';
            };
            suggestionsBox.appendChild(div);
        });
        suggestionsBox.style.display = 'block';
    } else {
        suggestionsBox.style.display = 'none';
    }
});

function addToCart(product) {
    const existing = cart.find(item => item.sku === product.sku);
    const productVat = product.vat ? parseFloat(product.vat) : 0;
    const productDiscount = product.discount ? parseFloat(product.discount) : 0;
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({ ...product, qty: 1, price: parseFloat(product.price),
            vatPercent: productVat, discountPercent: productDiscount
        });
    }
    renderCart();
}

function updateQty(sku, newQty) {
    const item = cart.find(i => i.sku === sku);
    if (item) {
        let qty = parseInt(newQty);
        if (isNaN(qty) || qty < 1) qty = 1; 
        item.qty = qty;
        renderCart();
    }
}

function deleteItem(sku) {
    if (confirm("Are you sure you want to remove this item from the cart?")) {
        cart = cart.filter(item => item.sku !== sku);
        renderCart();
    }
}

function calculateTotals() {
    let subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    let totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    let totalDiscount = cart.reduce((sum, item) => {
        let itemTotal = item.price * item.qty;
        return sum + (itemTotal * (item.discountPercent / 100));
    }, 0);
    
    let extraDiscountInput = parseFloat(document.getElementById('manual-discount').value) || 0;
    totalDiscount += extraDiscountInput;

    let totalVat = cart.reduce((sum, item) => {
        let itemTotal = item.price * item.qty;
        let itemNetTotal = itemTotal - (itemTotal * (item.discountPercent / 100));
        return sum + (itemNetTotal * (item.vatPercent / 100));
    }, 0);
    
    let grandTotal = subtotal - totalDiscount + totalVat;
    if (grandTotal < 0) grandTotal = 0;

    let cashPaid = parseFloat(document.getElementById('cash-paid').value.replace(/[^0-9.]/g, '')) || 0;
    let change = cashPaid - grandTotal; 

    document.getElementById('lbl-subtotal').innerText = subtotal.toFixed(2);
    document.getElementById('lbl-discount').innerText = totalDiscount.toFixed(2);
    document.getElementById('lbl-vat').innerText = totalVat.toFixed(2);
    document.getElementById('lbl-grandtotal').innerText = grandTotal.toFixed(2);
    document.getElementById('lbl-change').innerText = change.toFixed(2);
    document.getElementById('total-combined').innerText = cart.length + " / " + totalQty;

    return { subtotal, discount: totalDiscount, vat: totalVat, grandTotal, cashPaid, change };
}

function makeRoundDiscount() {
    let cashPaid = parseFloat(document.getElementById('cash-paid').value) || 0;
    if (cashPaid <= 0) { alert("Please enter the Cash Received amount first!"); return; }
    let oldManualDiscount = document.getElementById('manual-discount').value;
    document.getElementById('manual-discount').value = 0; 
    let totals = calculateTotals();
    let shortage = totals.grandTotal - cashPaid;
    
    if (shortage > 0) {
        let onePercentOfSubtotal = totals.subtotal * 0.01;
        if (shortage > 5 && shortage > onePercentOfSubtotal) {
            let confirmDiscount = confirm(`Extra discount (৳${shortage.toFixed(2)}) is higher ⚠️\nthan 1% of total (৳${onePercentOfSubtotal.toFixed(2)}) \n\nApprove?  🛒`);
            if (!confirmDiscount) {
                document.getElementById('manual-discount').value = oldManualDiscount;
                calculateTotals();
                return;
            }
        }
        document.getElementById('manual-discount').value = shortage.toFixed(2);
        calculateTotals();
    } else {
        alert("No shortage found!");
        document.getElementById('manual-discount').value = oldManualDiscount;
        calculateTotals();
    }
}

document.getElementById('cash-paid').addEventListener('change', function() {
    if (parseFloat(this.value) < 0) this.value = Math.abs(parseFloat(this.value));
    else if (this.value.trim() === "") this.value = 0;
    calculateTotals();
});
document.getElementById('cash-paid').addEventListener('input', calculateTotals);

function renderCart() {
    const tbody = document.getElementById('cart-table-body');
    tbody.innerHTML = '';
    cart.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="number" class="qty-input" value="${item.qty}" min="1" onchange="updateQty('${item.sku}', this.value)"></td>
            <td>${item.sku}</td>
            <td>${item.name}</td>
            <td>৳${item.price.toFixed(2)}</td>
            <td><button class="btn-delete" onclick="deleteItem('${item.sku}')">✕</button></td>
        `;
        tbody.appendChild(tr);
    });
    calculateTotals();
}

function processOrder() {
    if (cart.length === 0) { alert("Cart is empty!"); return; }
    const cashPaidInput = document.getElementById('cash-paid').value.trim();
    if (cashPaidInput === "") { alert("Please enter the Paid Amount!"); document.getElementById('cash-paid').focus(); return; }
    if (!confirm("Are you sure you want to process this order and print the receipt?")) return;

    const totals = calculateTotals();
    const customerName = document.getElementById('cust-name').value.trim() || "Walk-In";
    const customerMobile = document.getElementById('cust-mobile').value.trim();
    const employeeName = document.getElementById('emp-name').value.trim() || "Admin";
    
    const now = new Date();
    const orderId = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dateTimeStr = `${String(now.getDate()).padStart(2, '0')}-${months[now.getMonth()]}-${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let status = "Unpaid";
    if (totals.cashPaid >= totals.grandTotal) status = "Paid";
    else if (totals.cashPaid > 0) status = "Partially Paid";

    const payload = {
        orderId: orderId,
        dateTime: dateTimeStr,
        customerName: customerName,
        totalItems: cart.reduce((sum, i) => sum + i.qty, 0),
        grandTotal: totals.grandTotal.toFixed(2),
        status: status,
        partiallyPaid: status === "Partially Paid" ? totals.cashPaid.toFixed(2) : "",
        vat: totals.vat.toFixed(2),
        discount: totals.discount.toFixed(2),
        employeeName: employeeName,
        details: cart.map(i => `${i.sku} (x${i.qty})`).join(", ")
    };

    const savedOrders = JSON.parse(localStorage.getItem('pending_orders') || '[]');
    savedOrders.push(payload);
    localStorage.setItem('pending_orders', JSON.stringify(savedOrders));

    document.getElementById('p-order-id').innerText = orderId;
    document.getElementById('p-date').innerText = dateTimeStr;
    document.getElementById('p-customer').innerText = customerName;
    
    const qrContainer = document.getElementById('p-qr-code');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, { text: orderId, width: 51, height: 51 });
    
    const pTable = document.getElementById('p-items-table');
    pTable.innerHTML = `<tr><th align="left">Item</th><th align="center">Qty</th><th align="right">Rate</th></tr>`;
    cart.forEach(i => {
        pTable.innerHTML += `<tr><td>${i.name}</td><td align="center">×${i.qty}</td><td align="right">৳${i.price.toFixed(2)}</td></tr>`; 
    });
    
    document.getElementById('p-subtotal').innerText = totals.subtotal.toFixed(2);
    document.getElementById('p-discount').innerText = totals.discount.toFixed(2);
    document.getElementById('p-vat').innerText = totals.vat.toFixed(2);
    document.getElementById('p-grandtotal').innerText = totals.grandTotal.toFixed(2);
    document.getElementById('p-paid').innerText = totals.cashPaid.toFixed(2);
    document.getElementById('p-change').innerText = totals.change > 0 ? totals.change.toFixed(2) : "0.00";
    
    window.print();

    let whatsappUrl = "";
    if (customerMobile !== "") {
        let formattedMobile = customerMobile.startsWith("0") && !customerMobile.startsWith("88") ? "88" + customerMobile : customerMobile;
        
        // এখানে msg ভেরিয়েবল শুরু
        let msg = `🛒 *SACAR Mart - Cash Receipt*\n----------------------------------\n*Order ID:* ${orderId}\n*Date:* ${dateTimeStr}\n*Customer:* ${customerName}\n\n----------------------------------\n`;
        
        msg += `_Grand-Total:_ *৳${totals.grandTotal.toFixed(2)}*\n_payment status:_ *${status}*\n\n_Reward Points:_ *00* 💰\n\n~~~~~~~~~~~~~~~~\n\nClick this link to view your invoice slip:\n👉 https://www.facebook.com/share/1EWWy9FwmA/\n\n_Thank you for shopping with_ *SACAR Mart !*`;
        
        whatsappUrl = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
            ? `https://wa.me/${formattedMobile}?text=${encodeURIComponent(msg)}`
            : `https://web.whatsapp.com/send?phone=${formattedMobile}&text=${encodeURIComponent(msg)}`;
    }


    triggerSync(orderId, whatsappUrl);
    clearCartAndInputs();
}

function triggerSync(orderId, whatsappUrl) {
    const container = document.getElementById('sync-status-container');
    
    if (container.children.length >= 3) {
        container.removeChild(container.firstElementChild);
    }

    const toast = document.createElement('div');
    toast.className = 'sync-toast';
    toast.id = `toast-${orderId}`;
    toast.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>Saving Order [${orderId}]...</span>`;
    container.appendChild(toast);

    sendOrderToSheets(orderId, whatsappUrl);
}

function sendOrderToSheets(orderId, whatsappUrl) {
    const savedOrders = JSON.parse(localStorage.getItem('pending_orders') || '[]');
    const orderData = savedOrders.find(o => o.orderId === orderId);
    const toast = document.getElementById(`toast-${orderId}`);

    if (!orderData) { if (toast) toast.remove(); return; }

    fetch(WEB_APP_URL, {
        method: "POST", mode: "no-cors", cache: "no-cache",
        headers: { "Content-Type": "text/plain" }, body: JSON.stringify(orderData)
    })
    .then(() => {
        const currentOrders = JSON.parse(localStorage.getItem('pending_orders') || '[]');
        localStorage.setItem('pending_orders', JSON.stringify(currentOrders.filter(o => o.orderId !== orderId)));

        if (toast) {
            toast.className = 'sync-toast success';
            toast.innerHTML = `<i class="fas fa-check-circle" style="color:#2ecc71;"></i> <span>Order [${orderId}] Saved Successfully! 🎉</span>`;
            setTimeout(() => toast.remove(), 5000);
        }

        if (whatsappUrl) showWhatsAppModal(whatsappUrl);
    })
    .catch(() => {
        if (toast) {
            toast.className = 'sync-toast failed';
            let timeLeft = 40; 

            if (window.activeCountdown) {
                clearInterval(window.activeCountdown);
            }

            const updateToastHTML = () => {
                if (!document.getElementById(`toast-${orderId}`)) {
                    clearInterval(window.activeCountdown);
                    return;
                }
                toast.innerHTML = `
                    <i class="fas fa-exclamation-circle" style="color:#e74c3c;"></i> 
                    <span>Order [${orderId}] Save Failed! (${timeLeft}s)</span>
                    <button class="retry-btn" onclick="sendOrderToSheets('${orderId}', '${whatsappUrl}')" title="Retry"><i class="fas fa-sync-alt"></i></button>
                    <button class="cancel-btn" onclick="cancelToast('${orderId}')" title="Cancel"><i class="fas fa-times"></i></button>
                `;
            };

            updateToastHTML();

            window.activeCountdown = setInterval(() => {
                timeLeft--;
                if (timeLeft <= 0) {
                    clearInterval(window.activeCountdown);
                    cancelToast(orderId); 
                } else {
                    updateToastHTML(); 
                }
            }, 1000);
        }
    });
}

function cancelToast(orderId) {
    const toast = document.getElementById(`toast-${orderId}`);
    if (toast) toast.remove();
}

function initBackgroundSync() {
    setInterval(() => {
        const savedOrders = JSON.parse(localStorage.getItem('pending_orders') || '[]');
        if (savedOrders.length > 0 && navigator.onLine) {
            savedOrders.forEach(order => {
                const existingToast = document.getElementById(`toast-${order.orderId}`);
                if (!existingToast) triggerSync(order.orderId, "");
            });
        }
    }, 10000);
}

function showWhatsAppModal(url) {
    const overlay = document.getElementById('whatsapp-modal-overlay');
    const countdownSpan = document.getElementById('whatsapp-countdown');
    const timerBar = document.getElementById('whatsapp-timer-bar');
    const sendBtn = document.getElementById('whatsapp-send-btn');
    
    let timeLeft = 8; 
    countdownSpan.innerText = timeLeft;
    timerBar.style.transition = 'none';
    timerBar.style.transform = 'scaleX(1)';
    overlay.style.display = 'flex';
    
    setTimeout(() => {
        timerBar.style.transition = 'transform 8s linear';
        timerBar.style.transform = 'scaleX(0)';
    }, 50);

    sendBtn.onclick = function() { window.open(url, '_blank'); closeWhatsAppModal(); };

    modalInterval = setInterval(() => {
        timeLeft--;
        countdownSpan.innerText = timeLeft;
        if (timeLeft <= 0) clearInterval(modalInterval);
    }, 1000);

    modalTimeout = setTimeout(() => { closeWhatsAppModal(); }, 8000);
}

function closeWhatsAppModal() {
    document.getElementById('whatsapp-modal-overlay').style.display = 'none';
    if (modalTimeout) clearTimeout(modalTimeout);
    if (modalInterval) clearInterval(modalInterval);
}

function clearCartAndInputs() {
    cart = [];
    document.getElementById('cust-name').value = '';
    document.getElementById('cust-mobile').value = '';
    document.getElementById('cash-paid').value = '';
    document.getElementById('manual-discount').value = '';
    calculateTotals();
    renderCart();
}

document.addEventListener('contextmenu', event => event.preventDefault());

function cancelOrder() {
    if (confirm("Are you sure you want to cancel the entire order?")) {
        clearCartAndInputs();
        document.getElementById('search-input').value = '';
    }
}

function updateClock() {
    const now = new Date();
    document.getElementById('live-clock').innerText = now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

document.addEventListener('keydown', function(e) {
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j')) || (e.ctrlKey && (e.key === 'U' || e.key === 'u')) || (e.ctrlKey && (e.key === 'S' || e.key === 's'))) {
        e.preventDefault();
        alert("Security Alert: Source code access is restricted!");
        return false;
    }
});


