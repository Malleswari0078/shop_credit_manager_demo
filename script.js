
// =====================================
// SHOP CREDIT MANAGER
// =====================================

// Load saved customer records

let customers = JSON.parse(
    localStorage.getItem("shopCustomers") || "[]"
);

let nextSerial = Number(
    localStorage.getItem("nextSerial") || "1"
);

let selectedCustomerId = null;


// GET HTML ELEMENTS

const $ = id => document.getElementById(id);


// SAVE DATA

function saveData() {

    localStorage.setItem(
        "shopCustomers",
        JSON.stringify(customers)
    );

    localStorage.setItem(
        "nextSerial",
        String(nextSerial)
    );
}


// CURRENT DATE

function today() {

    const date = new Date();

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}


// MONEY FORMAT

function money(amount) {

    return "₹" + amount.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}


// ROUND TO TWO DECIMAL PLACES

function roundMoney(amount) {

    return Math.round((amount + Number.EPSILON) * 100) / 100;
}


// PROTECT CUSTOMER TEXT IN HTML

function escapeHTML(value) {

    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}


// FIND CUSTOMER

function getCustomer(id) {

    return customers.find(customer => customer.id === id);
}


// =====================================
// 1. REGISTER NEW CUSTOMER
// =====================================

$("customerForm").addEventListener("submit", function(event) {

    event.preventDefault();

    const name = $("customerName").value.trim();
    const phone = $("customerPhone").value.trim();
    const address = $("customerAddress").value.trim();

    if (!name || !/^\d{10}$/.test(phone)) {

        alert("Enter a valid name and 10-digit phone number.");
        return;
    }

    const serial = "CUST" +
        String(nextSerial).padStart(3, "0");

    const customer = {

        id: serial,
        name: name,
        phone: phone,
        address: address,

        loans: [],
        payments: []
    };

    customers.push(customer);

    nextSerial++;

    saveData();

    this.reset();

    $("registrationMessage").textContent =
        "Customer registered successfully! Serial Number: " + serial;

    updateDashboard();
    displayCustomers();

});


// =====================================
// 2. MONTHLY INTEREST CALCULATION
// =====================================

// Add months without losing the original
// monthly anniversary day.

function addMonths(dateString, months) {

    const [year, month, day] =
        dateString.split("-").map(Number);

    const date = new Date(Date.UTC(
        year,
        month - 1 + months,
        1
    ));

    const lastDay = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        0
    )).getUTCDate();

    date.setUTCDate(Math.min(day, lastDay));

    return date.toISOString().slice(0, 10);
}


// Count completed months.

function completedMonths(startDate, endDate = today()) {

    let months = 0;

    while (addMonths(startDate, months + 1) <= endDate) {

        months++;
    }

    return months;
}


// Calculate interest for one borrowing.

function loanInterest(loan, date = today()) {

    const months = completedMonths(
        loan.lastInterestDate,
        date
    );

    const interest = roundMoney(
        loan.principal * 0.02 * months
    );

    return {
        months: months,
        amount: interest
    };
}


// =====================================
// 3. CUSTOMER BALANCE
// =====================================

function customerBalance(customer, date = today()) {

    let principal = 0;
    let interest = 0;

    customer.loans.forEach(loan => {

        const result = loanInterest(loan, date);

        principal += loan.principal;

        interest += loan.interest + result.amount;

    });

    principal = roundMoney(principal);
    interest = roundMoney(interest);

    return {

        principal: principal,
        interest: interest,

        total: roundMoney(principal + interest)

    };
}


// =====================================
// 4. DASHBOARD
// =====================================

function updateDashboard() {

    let principal = 0;
    let interest = 0;
    let pending = 0;

    customers.forEach(customer => {

        const balance = customerBalance(customer);

        principal += balance.principal;
        interest += balance.interest;
        pending += balance.total;

    });

    $("totalCustomers").textContent = customers.length;

    $("totalPrincipal").textContent = money(principal);

    $("totalInterest").textContent = money(interest);

    $("totalPending").textContent = money(pending);

}


// =====================================
// 5. DISPLAY CUSTOMER LIST
// =====================================

function displayCustomers(list = customers) {

    const table = $("customerList");

    table.innerHTML = "";

    if (list.length === 0) {

        table.innerHTML =
            "<tr><td colspan='5'>No customers found.</td></tr>";

        return;
    }

    list.forEach(customer => {

        const balance = customerBalance(customer);

        const row = document.createElement("tr");

        row.innerHTML = `

            <td>${escapeHTML(customer.id)}</td>

            <td>${escapeHTML(customer.name)}</td>

            <td>${escapeHTML(customer.phone)}</td>

            <td>${money(balance.total)}</td>

            <td>
                <button class="action-button"
                    data-id="${escapeHTML(customer.id)}">
                    View
                </button>
            </td>

        `;

        table.appendChild(row);

    });

}


// =====================================
// 6. SEARCH CUSTOMER
// =====================================

function searchCustomer() {

    const id = $("searchInput").value.trim().toUpperCase();

    const customer = getCustomer(id);

    if (!customer) {

        selectedCustomerId = null;

        $("customerSection").classList.add("hidden");

        alert("Customer not found!");

        return;
    }

    showCustomer(customer.id);

}


$("searchButton").addEventListener(
    "click",
    searchCustomer
);


$("searchInput").addEventListener("keydown", function(event) {

    if (event.key === "Enter") {

        searchCustomer();

    }

});


$("showAllButton").addEventListener("click", function() {

    selectedCustomerId = null;

    $("customerSection").classList.add("hidden");

    displayCustomers();

});


// =====================================
// 7. OPEN CUSTOMER DETAILS
// =====================================

function showCustomer(id) {

    selectedCustomerId = id;

    $("customerSection").classList.remove("hidden");

    displayCustomerDetails();

    displayHistory();

}


$("customerList").addEventListener("click", function(event) {

    const button = event.target.closest("button[data-id]");

    if (button) {

        showCustomer(button.dataset.id);

    }

});


$("closeDetailsButton").addEventListener("click", function() {

    selectedCustomerId = null;

    $("customerSection").classList.add("hidden");

});


// =====================================
// 8. CHECK TRANSACTION DATE
// =====================================

// Prevent entering an earlier transaction
// after a later transaction is already recorded.

function latestTransactionDate(customer) {

    const dates = [

        ...customer.loans.map(loan => loan.date),

        ...customer.payments.map(payment => payment.date)

    ];

    return dates.length ? dates.sort().at(-1) : "";

}


function validTransactionDate(customer, date) {

    if (!date || date > today()) {

        return false;

    }

    const latest = latestTransactionDate(customer);

    return !latest || date >= latest;

}


// =====================================
// 9. CUSTOMER DETAILS
// =====================================

function displayCustomerDetails() {

    const customer = getCustomer(selectedCustomerId);

    if (!customer) return;

    const balance = customerBalance(customer);

    const borrowingDates = customer.loans.map(
        loan => loan.date
    );

    const lastBorrow = borrowingDates.length
        ? borrowingDates.sort().at(-1)
        : "No borrowing yet";

    $("customerDetails").innerHTML = `

        <p>
            <b>Serial Number:</b>
            ${escapeHTML(customer.id)}
        </p>

        <p>
            <b>Customer Name:</b>
            ${escapeHTML(customer.name)}
        </p>

        <p>
            <b>Phone Number:</b>
            ${escapeHTML(customer.phone)}
        </p>

        <p>
            <b>Address:</b>
            ${escapeHTML(customer.address || "-")}
        </p>

        <p>
            <b>Last Borrowing Date:</b>
            ${escapeHTML(lastBorrow)}
        </p>

        <p>
            <b>Outstanding Principal:</b>
            ${money(balance.principal)}
        </p>

        <p>
            <b>Total Interest:</b>
            ${money(balance.interest)}
        </p>

        <h3 class="amount">
            Total Pending: ${money(balance.total)}
        </h3>

        <p><b>Interest Rate:</b> 2% per completed month</p>

    `;

    updateDashboard();

    displayCustomers();

}


// =====================================
// 10. ADD NEW BORROWING
// =====================================

$("borrowForm").addEventListener("submit", function(event) {

    event.preventDefault();

    const customer = getCustomer(selectedCustomerId);

    if (!customer) return;

    const date = $("borrowDate").value;

    const amount = Number($("borrowAmount").value);

    if (!validTransactionDate(customer, date) ||
        !Number.isFinite(amount) || amount <= 0) {

        alert("Enter a valid amount and a transaction date that is not earlier than the latest recorded transaction.");

        return;
    }

    const loan = {

        date: date,

        originalAmount: roundMoney(amount),

        principal: roundMoney(amount),

        interest: 0,

        lastInterestDate: date

    };

    customer.loans.push(loan);

    saveData();

    this.reset();

    $("borrowDate").value = today();

    alert("Borrowing recorded successfully!");

    displayCustomerDetails();

    displayHistory();

});


// =====================================
// 11. RECORD PAYMENT
// =====================================

$("paymentForm").addEventListener("submit", function(event) {

    event.preventDefault();

    const customer = getCustomer(selectedCustomerId);

    if (!customer) return;

    const date = $("paymentDate").value;

    const amount = roundMoney(
        Number($("paymentAmount").value)
    );

    if (!validTransactionDate(customer, date) ||
        !Number.isFinite(amount) || amount <= 0) {

        alert("Enter a valid payment amount and date.");

        return;
    }

    const balance = customerBalance(customer, date);

    if (amount > balance.total) {

        alert("Payment cannot exceed the pending balance.");

        return;
    }

    let remaining = amount;

    let interestPaid = 0;

    let principalPaid = 0;


    // First update accrued interest on all loans.

    customer.loans.forEach(loan => {

        const result = loanInterest(loan, date);

        loan.interest = roundMoney(
            loan.interest + result.amount
        );

        loan.lastInterestDate = addMonths(
            loan.lastInterestDate,
            result.months
        );

    });


    // Pay interest before principal.

    customer.loans.forEach(loan => {

        const paid = Math.min(
            remaining,
            loan.interest
        );

        loan.interest = roundMoney(
            loan.interest - paid
        );

        remaining = roundMoney(
            remaining - paid
        );

        interestPaid = roundMoney(
            interestPaid + paid
        );

    });


    // Pay outstanding principal.

    customer.loans.forEach(loan => {

        if (remaining <= 0) return;

        const paid = Math.min(
            remaining,
            loan.principal
        );

        loan.principal = roundMoney(
            loan.principal - paid
        );

        remaining = roundMoney(
            remaining - paid
        );

        principalPaid = roundMoney(
            principalPaid + paid
        );

        // Restart the interest period only
        // when principal is reduced.

        if (paid > 0) {

            loan.lastInterestDate = date;

        }

    });


    // Save payment history.

    customer.payments.push({

        date: date,

        amount: amount,

        interestPaid: interestPaid,

        principalPaid: principalPaid

    });


    // Keep fully paid loans for history.

    saveData();

    this.reset();

    $("paymentDate").value = today();

    alert(
        "Payment recorded successfully!\n\n" +
        "Interest paid: " + money(interestPaid) +
        "\nPrincipal paid: " + money(principalPaid)
    );

    displayCustomerDetails();

    displayHistory();

});


// =====================================
// 12. TRANSACTION HISTORY
// =====================================

function displayHistory() {

    const customer = getCustomer(selectedCustomerId);

    if (!customer) return;

    const transactions = [];


    // Borrowing records.

    customer.loans.forEach(loan => {

        transactions.push({

            date: loan.date,

            type: "Borrowing",

            description: "Money borrowed",

            amount: loan.originalAmount

        });

    });


    // Payment records.

    customer.payments.forEach(payment => {

        transactions.push({

            date: payment.date,

            type: "Payment",

            description:
                "Interest paid: " + money(payment.interestPaid) +
                " | Principal paid: " + money(payment.principalPaid),

            amount: payment.amount

        });

    });


    transactions.sort((a, b) =>
        b.date.localeCompare(a.date)
    );


    const table = $("historyList");

    table.innerHTML = "";


    if (transactions.length === 0) {

        table.innerHTML =
            "<tr><td colspan='3'>No transactions yet.</td></tr>";

        return;
    }


    transactions.forEach(transaction => {

        const row = document.createElement("tr");

        row.innerHTML = `

            <td>${escapeHTML(transaction.date)}</td>

            <td>
                ${escapeHTML(transaction.type)}
                <br>
                <small>${escapeHTML(transaction.description)}</small>
            </td>

            <td>${money(transaction.amount)}</td>

        `;

        table.appendChild(row);

    });

}


// =====================================
// 13. INITIALIZE WEBSITE
// =====================================

$("borrowDate").value = today();

$("paymentDate").value = today();

$("borrowDate").max = today();

$("paymentDate").max = today();

updateDashboard();

displayCustomers();
