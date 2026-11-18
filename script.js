
// =====================================
// SUPABASE DATABASE CONNECTION
// =====================================

const SUPABASE_URL = "https://hbploxfxzoskgfqewyad.supabase.co";

const SUPABASE_ANON_KEY = "sb_publishable__FTAi9yUsvm0CTFakwiztw_heSF3AgN";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);
async function adminLogin() {
    const email = prompt("Enter admin email:");
    if (!email) return;

    const password = prompt("Enter admin password:");
    if (!password) return;

    const { data, error } =
        await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

    if (error) {
        alert("Login failed: " + error.message);
        return;
    }

    alert("Admin login successful!");
    console.log("Admin authenticated");
    await loadCustomers();
}
console.log("Supabase connected successfully!");

// =====================================
// SHOP CREDIT MANAGER
// =====================================

// Customer records will be loaded from Supabase

let customers = [];

let selectedCustomerId = null;


// GET HTML ELEMENTS

const $ = id => document.getElementById(id);
// LOAD CUSTOMERS FROM SUPABASE
// LOAD CUSTOMERS, BORROWINGS AND PAYMENTS

async function loadCustomers() {

    const { data: customerData, error: customerError } =
        await supabaseClient.from("customers").select("*");

    if (customerError) {
        alert(customerError.message);
        return;
    }

    const { data: loanData, error: loanError } =
        await supabaseClient.from("borrowings").select("*");

    if (loanError) {
        alert(loanError.message);
        return;
    }

    const { data: paymentData, error: paymentError } =
        await supabaseClient.from("payments").select("*");

    if (paymentError) {
        alert(paymentError.message);
        return;
    }

    customers = customerData.map(row => {

        const loans = loanData
            .filter(loan => String(loan.customer_id) === String(row.id))
            .map(loan => ({
                dbId: loan.id,
                date: loan.borrowed_date,
                originalAmount: Number(loan.borrowed_amount),
                principal: Number(loan.principal_remaining),
                interest: Number(loan.interest_balance),
                lastInterestDate: loan.last_interest_date
            }));

        const payments = [];

        loans.forEach(loan => {
            paymentData
                .filter(payment => String(payment.borrowing_id) === String(loan.dbId))
                .forEach(payment => {
                    payments.push({
                        date: payment.payment_date,
                        amount: Number(payment.payment_amount),
                        interestPaid: Number(payment.interest_paid),
                        principalPaid: Number(payment.principal_paid)
                    });
                });
        });

        return {
            dbId: row.id,
            id: row.customer_code,
            name: row.full_name,
            phone: row.phone,
            address: row.address,
            loans,
            payments
        };
    });

    updateDashboard();
    displayCustomers();
}



// SAVE DATA

async function saveData() {
    console.log("Data will be saved directly to Supabase.");
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

// REGISTER NEW CUSTOMER IN SUPABASE

$("customerForm").addEventListener("submit", async function(event) {

    event.preventDefault();

    const name = $("customerName").value.trim();
    const phone = $("customerPhone").value.trim();
    const address = $("customerAddress").value.trim();

    if (!name || !/^\d{10}$/.test(phone)) {
        alert("Enter a valid name and 10-digit phone number.");
        return;
    }

    const { data: lastCustomer, error: searchError } =
        await supabaseClient
            .from("customers")
            .select("customer_code")
            .order("id", { ascending: false })
            .limit(1);

    if (searchError) {
        alert(searchError.message);
        return;
    }

    const nextNumber = lastCustomer.length
        ? Number(lastCustomer[0].customer_code.replace("CUST", "")) + 1
        : 1;

    const serial = "CUST" + String(nextNumber).padStart(3, "0");

    const { error } = await supabaseClient
        .from("customers")
        .insert([{
            customer_code: serial,
            full_name: name,
            phone: phone,
            address: address
        }]);

    if (error) {
        alert("Registration failed: " + error.message);
        return;
    }

    this.reset();

    $("registrationMessage").textContent =
        "Customer registered successfully! Serial Number: " + serial;

    await loadCustomers();

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


// RECORD NEW BORROWING IN SUPABASE

$("borrowForm").addEventListener("submit", async function(event) {

    event.preventDefault();

    const customer = getCustomer(selectedCustomerId);

    if (!customer) return;

    const date = $("borrowDate").value;
    const amount = roundMoney(Number($("borrowAmount").value));

    if (!validTransactionDate(customer, date) ||
        !Number.isFinite(amount) || amount <= 0) {

        alert("Enter a valid amount and borrowing date.");
        return;
    }

    const { data, error } = await supabaseClient
        .from("borrowings")
        .insert([{
            customer_id: customer.dbId,
            borrowed_amount: amount,
            borrowed_date: date,
            principal_remaining: amount,
            interest_balance: 0,
            last_interest_date: date
        }])
        .select()
        .single();

    if (error) {
        alert("Borrowing failed: " + error.message);
        return;
    }

    this.reset();
    $("borrowDate").value = today();

    await loadCustomers();

    displayCustomerDetails();
    displayHistory();

    alert("Borrowing recorded successfully!");
});



// =====================================
// 11. RECORD PAYMENT
// =====================================


 // RECORD PAYMENT IN SUPABASE

$("paymentForm").addEventListener("submit", async function(event) {

    event.preventDefault();

    const customer = getCustomer(selectedCustomerId);

    if (!customer) return;

    const date = $("paymentDate").value;
    const amount = roundMoney(Number($("paymentAmount").value));

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

    const allocations = customer.loans.map(loan => {

        const months = completedMonths(loan.lastInterestDate, date);

        const accruedInterest = roundMoney(
            loan.principal * 0.02 * months
        );

        return {
            loan,
            principal: loan.principal,
            interest: roundMoney(loan.interest + accruedInterest),
            lastInterestDate: addMonths(loan.lastInterestDate, months),
            interestPaid: 0,
            principalPaid: 0
        };
    });

    // Pay interest first

    allocations.forEach(item => {

        const paid = roundMoney(
            Math.min(remaining, item.interest)
        );

        item.interest = roundMoney(item.interest - paid);
        item.interestPaid = paid;
        remaining = roundMoney(remaining - paid);

    });

    // Pay principal next

    allocations.forEach(item => {

        if (remaining <= 0) return;

        const paid = roundMoney(
            Math.min(remaining, item.principal)
        );

        item.principal = roundMoney(item.principal - paid);
        item.principalPaid = paid;
        remaining = roundMoney(remaining - paid);

        if (paid > 0) {
            item.lastInterestDate = date;
        }

    });

    // Save each borrowing balance and its payment

    for (const item of allocations) {

        const paymentAmount = roundMoney(
            item.interestPaid + item.principalPaid
        );

        if (paymentAmount <= 0) continue;

        const { error: updateError } = await supabaseClient
            .from("borrowings")
            .update({
                principal_remaining: item.principal,
                interest_balance: item.interest,
                last_interest_date: item.lastInterestDate
            })
            .eq("id", item.loan.dbId);

        if (updateError) {
            alert("Unable to update borrowing: " + updateError.message);
            return;
        }

        const { error: paymentError } = await supabaseClient
            .from("payments")
            .insert([{
                borrowing_id: item.loan.dbId,
                payment_amount: paymentAmount,
                payment_date: date,
                interest_paid: item.interestPaid,
                principal_paid: item.principalPaid
            }]);

        if (paymentError) {
            alert("Unable to save payment: " + paymentError.message);
            return;
        }
    }

    this.reset();
    $("paymentDate").value = today();

    await loadCustomers();

    displayCustomerDetails();
    displayHistory();

    alert("Payment recorded successfully!");

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
