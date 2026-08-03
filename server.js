const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

const MAX_PLAYERS = 4;

const WORLD = {
width: 1400,
height: 800
};

# /*

# OCTANE GAME STATE

*/

const game = {
money: 100,

```
fuel: 40,
maxFuel: 100,

storeStock: 20,
maxStoreStock: 40,

cleanliness: 100,

day: 1,
dayTime: 8 * 60,

players: {},
bots: {},
customers: {},

nextBotId: 1,
nextCustomerId: 1,

upgrades: {
    pumps: 2,
    storeShelves: 2,
    employeeSlots: 2
}
```

};

const PLAYER_COLORS = [
"#ff5252",
"#4dabf7",
"#51cf66",
"#fcc419"
];

const BOT_NAMES = [
"Alex",
"Sam",
"Jamie",
"Riley",
"Casey",
"Morgan"
];

# /*

# STATION AREAS

*/

const AREAS = {
building: {
x: 350,
y: 170,
width: 550,
height: 430
},

```
register: {
    x: 470,
    y: 230,
    width: 120,
    height: 80
},

shelves: {
    x: 680,
    y: 230,
    width: 150,
    height: 200
},

storage: {
    x: 390,
    y: 450,
    width: 150,
    height: 100
},

cleaning: {
    x: 570,
    y: 500,
    width: 120,
    height: 70
},

pumps: [
    {
        x: 980,
        y: 230
    },
    {
        x: 1120,
        y: 230
    }
],

entrance: {
    x: 650,
    y: 700
}
```

};

# /*

# UTILITY FUNCTIONS

*/

function random(min, max) {
return Math.random() * (max - min) + min;
}

function distance(a, b) {
return Math.sqrt(
Math.pow(a.x - b.x, 2) +
Math.pow(a.y - b.y, 2)
);
}

function clamp(value, min, max) {
return Math.max(min, Math.min(max, value));
}

function formatTime(minutes) {
const hours = Math.floor(minutes / 60);
const mins = Math.floor(minutes % 60);

```
return (
    String(hours).padStart(2, "0") +
    ":" +
    String(mins).padStart(2, "0")
);
```

}

# /*

# COLLISION

*/

function collidesWithBuilding(x, y) {
const b = AREAS.building;

```
if (
    x > b.x &&
    x < b.x + b.width &&
    y > b.y &&
    y < b.y + b.height
) {
    // Main door opening
    const doorX = 600;
    const doorWidth = 100;

    if (
        y > b.y + b.height - 20 &&
        x > doorX &&
        x < doorX + doorWidth
    ) {
        return false;
    }

    return true;
}

return false;
```

}

function isBlocked(x, y) {
if (x < 20 || x > WORLD.width - 20) {
return true;
}

```
if (y < 20 || y > WORLD.height - 20) {
    return true;
}

if (collidesWithBuilding(x, y)) {
    return true;
}

return false;
```

}

# /*

# CUSTOMERS

*/

function createCustomer() {
const id = `customer-${game.nextCustomerId++}`;

```
const pumpIndex =
    Math.floor(
        Math.random() *
        game.upgrades.pumps
    );

const pump =
    AREAS.pumps[pumpIndex];

const customer = {
    id,

    x: AREAS.entrance.x,
    y: AREAS.entrance.y,

    targetX: pump.x,
    targetY: pump.y + 70,

    state: "goingToPump",

    pumpIndex,

    fuelNeeded: Math.floor(
        random(8, 20)
    ),

    fuelProgress: 0,

    patience: 100,

    shopping: Math.random() < 0.5,

    storeProgress: 0,

    checkoutProgress: 0,

    payment: 0
};

game.customers[id] = customer;
```

}

# /*

# CUSTOMER MOVEMENT

*/

function moveTowards(entity, targetX, targetY, speed) {
const dx = targetX - entity.x;
const dy = targetY - entity.y;

```
const length =
    Math.sqrt(dx * dx + dy * dy);

if (length < 2) {
    return true;
}

entity.x +=
    (dx / length) * speed;

entity.y +=
    (dy / length) * speed;

return false;
```

}

# /*

# PLAYER INTERACTION

*/

function interactWithPlayer(player) {

```
/*
-----------------------------------------
FUEL PUMP
-----------------------------------------
*/

for (
    let i = 0;
    i < game.upgrades.pumps;
    i++
) {

    const pump =
        AREAS.pumps[i];

    const pumpDistance =
        Math.hypot(
            player.x - pump.x,
            player.y - pump.y
        );

    if (pumpDistance < 70) {

        const customer =
            Object.values(
                game.customers
            ).find(c =>
                c.pumpIndex === i &&
                c.state === "waitingForFuel"
            );

        if (
            customer &&
            game.fuel > 0
        ) {

            customer.state =
                "fueling";

            customer.fuelProgress = 0;

            player.currentAction =
                "fueling";

            return;
        }
    }
}

/*
-----------------------------------------
REGISTER
-----------------------------------------
*/

const registerDistance =
    Math.hypot(
        player.x -
        (AREAS.register.x + 60),

        player.y -
        (AREAS.register.y + 40)
    );

if (registerDistance < 80) {

    const customer =
        Object.values(
            game.customers
        ).find(
            c =>
                c.state ===
                "waitingForCheckout"
        );

    if (customer) {

        customer.state =
            "checkingOut";

        customer.checkoutProgress =
            0;

        player.currentAction =
            "checkout";

        return;
    }
}

/*
-----------------------------------------
RESTOCK
-----------------------------------------
*/

const storageDistance =
    Math.hypot(
        player.x -
        (AREAS.storage.x + 75),

        player.y -
        (AREAS.storage.y + 50)
    );

if (storageDistance < 90) {

    if (
        game.money >= 20 &&
        game.storeStock <
        game.maxStoreStock
    ) {

        game.money -= 20;

        game.storeStock =
            Math.min(
                game.maxStoreStock,
                game.storeStock + 10
            );

        player.currentAction =
            "restocking";

        return;
    }
}

/*
-----------------------------------------
CLEAN
-----------------------------------------
*/

const cleanDistance =
    Math.hypot(
        player.x -
        (AREAS.cleaning.x + 60),

        player.y -
        (AREAS.cleaning.y + 35)
    );

if (cleanDistance < 90) {

    game.cleanliness =
        Math.min(
            100,
            game.cleanliness + 10
        );

    player.currentAction =
        "cleaning";

    return;
}

/*
-----------------------------------------
STORE
-----------------------------------------
*/

const shelfDistance =
    Math.hypot(
        player.x -
        (AREAS.shelves.x + 75),

        player.y -
        (AREAS.shelves.y + 100)
    );

if (shelfDistance < 100) {

    const customer =
        Object.values(
            game.customers
        ).find(
            c =>
                c.state ===
                "shopping"
        );

    if (
        customer &&
        game.storeStock > 0
    ) {

        customer.state =
            "waitingForCheckout";

        game.storeStock--;

        customer.payment = 8;

        player.currentAction =
            "helpingCustomer";

        return;
    }
}
```

}

# /*

# PLAYER CONNECTIONS

*/

io.on("connection", socket => {

```
console.log(
    "Connection:",
    socket.id
);

socket.on(
    "joinGame",
    name => {

        if (
            Object.keys(
                game.players
            ).length >= MAX_PLAYERS
        ) {

            socket.emit(
                "joinError",
                "The station is full! Maximum 4 players."
            );

            return;
        }

        const playerName =
            typeof name === "string" &&
            name.trim()
                ? name.trim().substring(0, 20)
                : "Player";

        const playerIndex =
            Object.keys(
                game.players
            ).length;

        game.players[socket.id] = {

            id: socket.id,

            name: playerName,

            x: 650 + playerIndex * 35,

            y: 650,

            color:
                PLAYER_COLORS[
                    playerIndex
                ],

            currentAction: "idle"
        };

        socket.emit(
            "joined",
            {
                id: socket.id
            }
        );

        broadcastState();
    }
);

socket.on(
    "move",
    data => {

        const player =
            game.players[
                socket.id
            ];

        if (!player) {
            return;
        }

        const speed = 4;

        let newX =
            player.x;

        let newY =
            player.y;

        if (data.up) {
            newY -= speed;
        }

        if (data.down) {
            newY += speed;
        }

        if (data.left) {
            newX -= speed;
        }

        if (data.right) {
            newX += speed;
        }

        if (
            !isBlocked(
                newX,
                player.y
            )
        ) {

            player.x =
                clamp(
                    newX,
                    20,
                    WORLD.width - 20
                );
        }

        if (
            !isBlocked(
                player.x,
                newY
            )
        ) {

            player.y =
                clamp(
                    newY,
                    20,
                    WORLD.height - 20
                );
        }
    }
);

socket.on(
    "interact",
    () => {

        const player =
            game.players[
                socket.id
            ];

        if (!player) {
            return;
        }

        interactWithPlayer(
            player
        );
    }
);

/*
-----------------------------------------
HIRE BOT
-----------------------------------------
*/

socket.on(
    "hireBot",
    () => {

        const botCount =
            Object.keys(
                game.bots
            ).length;

        if (
            botCount >=
            game.upgrades.employeeSlots
        ) {
            return;
        }

        if (
            game.money < 50
        ) {
            return;
        }

        game.money -= 50;

        const id =
            `bot-${game.nextBotId++}`;

        game.bots[id] = {

            id,

            name:
                BOT_NAMES[
                    Math.floor(
                        Math.random() *
                        BOT_NAMES.length
                    )
                ],

            x: 650,

            y: 650,

            job: "fuel",

            actionTimer: 0
        };

        broadcastState();
    }
);

/*
-----------------------------------------
UPGRADES
-----------------------------------------
*/

socket.on(
    "upgrade",
    type => {

        if (
            type === "pump"
        ) {

            if (
                game.money >= 250 &&
                game.upgrades.pumps < 4
            ) {

                game.money -= 250;

                game.upgrades.pumps++;

                AREAS.pumps.push({
                    x:
                        980 +
                        game.upgrades.pumps *
                        70,

                    y: 230
                });
            }
        }

        if (
            type === "shelves"
        ) {

            if (
                game.money >= 200
            ) {

                game.money -= 200;

                game.upgrades.storeShelves++;

                game.maxStoreStock += 20;
            }
        }

        if (
            type === "employees"
        ) {

            if (
                game.money >= 300 &&
                game.upgrades.employeeSlots < 6
            ) {

                game.money -= 300;

                game.upgrades.employeeSlots++;
            }
        }

        broadcastState();
    }
);

socket.on(
    "disconnect",
    () => {

        console.log(
            "Disconnected:",
            socket.id
        );

        delete game.players[
            socket.id
        ];

        broadcastState();
    }
);
```

});

# /*

# BOT AI

*/

function updateBots() {

```
for (
    const bot of
    Object.values(
        game.bots
    )
) {

    bot.actionTimer++;

    /*
    -----------------------------------------
    FUEL BOT
    -----------------------------------------
    */

    if (
        bot.job === "fuel"
    ) {

        const customer =
            Object.values(
                game.customers
            ).find(
                c =>
                    c.state ===
                    "waitingForFuel"
            );

        if (customer) {

            const pump =
                AREAS.pumps[
                    customer.pumpIndex
                ];

            const arrived =
                moveTowards(
                    bot,
                    pump.x,
                    pump.y + 70,
                    2
                );

            if (
                arrived &&
                game.fuel > 0
            ) {

                customer.state =
                    "fueling";

                customer.fuelProgress =
                    0;
            }
        }
    }

    /*
    -----------------------------------------
    CASHIER BOT
    -----------------------------------------
    */

    if (
        bot.job === "cashier"
    ) {

        const customer =
            Object.values(
                game.customers
            ).find(
                c =>
                    c.state ===
                    "waitingForCheckout"
            );

        if (customer) {

            const arrived =
                moveTowards(
                    bot,
                    AREAS.register.x + 60,
                    AREAS.register.y + 40,
                    2
                );

            if (arrived) {

                customer.state =
                    "checkingOut";

                customer.checkoutProgress =
                    0;
            }
        }
    }

    /*
    -----------------------------------------
    RESTOCK BOT
    -----------------------------------------
    */

    if (
        bot.job === "restock"
    ) {

        const arrived =
            moveTowards(
                bot,
                AREAS.storage.x + 75,
                AREAS.storage.y + 50,
                2
            );

        if (
            arrived &&
            bot.actionTimer > 60
        ) {

            if (
                game.money >= 20 &&
                game.storeStock <
                game.maxStoreStock
            ) {

                game.money -= 20;

                game.storeStock =
                    Math.min(
                        game.maxStoreStock,
                        game.storeStock + 10
                    );
            }

            bot.actionTimer = 0;
        }
    }

    /*
    -----------------------------------------
    CLEAN BOT
    -----------------------------------------
    */

    if (
        bot.job === "clean"
    ) {

        const arrived =
            moveTowards(
                bot,
                AREAS.cleaning.x + 60,
                AREAS.cleaning.y + 35,
                2
            );

        if (
            arrived &&
            bot.actionTimer > 60
        ) {

            game.cleanliness =
                Math.min(
                    100,
                    game.cleanliness + 10
                );

            bot.actionTimer = 0;
        }
    }
}
```

}

# /*

# CUSTOMER AI

*/

function updateCustomers() {

```
for (
    const customer of
    Object.values(
        game.customers
    )
) {

    /*
    -----------------------------------------
    GO TO PUMP
    -----------------------------------------
    */

    if (
        customer.state ===
        "goingToPump"
    ) {

        const arrived =
            moveTowards(
                customer,
                customer.targetX,
                customer.targetY,
                1.5
            );

        if (arrived) {

            customer.state =
                "waitingForFuel";
        }
    }

    /*
    -----------------------------------------
    FUELING
    -----------------------------------------
    */

    else if (
        customer.state ===
        "fueling"
    ) {

        if (
            game.fuel <= 0
        ) {

            customer.state =
                "leaving";

            continue;
        }

        customer.fuelProgress += 1;

        game.fuel -=
            customer.fuelNeeded /
            100;

        if (
            customer.fuelProgress >=
            100
        ) {

            game.money +=
                customer.fuelNeeded * 2;

            if (
                customer.shopping
            ) {

                customer.state =
                    "shopping";

                customer.targetX =
                    AREAS.shelves.x +
                    75;

                customer.targetY =
                    AREAS.shelves.y +
                    100;

            } else {

                customer.state =
                    "leaving";
            }
        }
    }

    /*
    -----------------------------------------
    SHOPPING
    -----------------------------------------
    */

    else if (
        customer.state ===
        "shopping"
    ) {

        const arrived =
            moveTowards(
                customer,
                customer.targetX,
                customer.targetY,
                1
            );

        if (
            arrived
        ) {

            customer.state =
                "shopping";

            customer.patience -=
                0.2;
        }
    }

    /*
    -----------------------------------------
    CHECKOUT
    -----------------------------------------
    */

    else if (
        customer.state ===
        "checkingOut"
    ) {

        customer.checkoutProgress++;

        if (
            customer.checkoutProgress >=
            60
        ) {

            game.money +=
                customer.payment;

            customer.state =
                "leaving";
        }
    }

    /*
    -----------------------------------------
    LEAVING
    -----------------------------------------
    */

    else if (
        customer.state ===
        "leaving"
    ) {

        const arrived =
            moveTowards(
                customer,
                AREAS.entrance.x,
                AREAS.entrance.y,
                2
            );

        if (arrived) {

            delete game.customers[
                customer.id
            ];
        }
    }

    /*
    -----------------------------------------
    CUSTOMER PATIENCE
    -----------------------------------------
    */

    if (
        customer.state !==
        "leaving"
    ) {

        customer.patience -=
            0.02;

        if (
            customer.patience <= 0
        ) {

            customer.state =
                "leaving";
        }
    }
}

/*
-----------------------------------------
SPAWN CUSTOMERS
-----------------------------------------
*/

const customerCount =
    Object.keys(
        game.customers
    ).length;

if (
    customerCount < 8 &&
    Math.random() < 0.03
) {

    createCustomer();
}
```

}

# /*

# DAY CYCLE

*/

function updateTime() {

```
game.dayTime += 0.2;

if (
    game.dayTime >=
    24 * 60
) {

    game.dayTime = 0;

    game.day++;

    /*
    Daily operating cost.
    */

    game.money -= 25;

    if (
        game.money < 0
    ) {

        game.money = 0;
    }
}

/*
Station gets dirty over time.
*/

game.cleanliness =
    Math.max(
        0,
        game.cleanliness - 0.005
    );
```

}

# /*

# GAME STATE

*/

function getState() {

```
return {

    money:
        Math.floor(
            game.money
        ),

    fuel:
        Math.floor(
            game.fuel
        ),

    maxFuel:
        game.maxFuel,

    storeStock:
        game.storeStock,

    maxStoreStock:
        game.maxStoreStock,

    cleanliness:
        Math.floor(
            game.cleanliness
        ),

    day:
        game.day,

    time:
        formatTime(
            game.dayTime
        ),

    players:
        game.players,

    bots:
        game.bots,

    customers:
        game.customers,

    upgrades:
        game.upgrades,

    playerCount:
        Object.keys(
            game.players
        ).length,

    maxPlayers:
        MAX_PLAYERS
};
```

}

function broadcastState() {

```
io.emit(
    "gameState",
    getState()
);
```

}

# /*

# GAME LOOP

*/

setInterval(
() => {

```
    updateBots();

    updateCustomers();

    updateTime();

    broadcastState();

},
1000 / 20
```

);

# /*

# SERVER

*/

app.get(
"/",
(req, res) => {

```
    res.sendFile(
        path.join(
            __dirname,
            "index.html"
        )
    );
}
```

);

server.listen(
PORT,
() => {

```
    console.log(
        `Octane running on port ${PORT}`
    );

}
```

);

```

---

# `index.html`

:::writing{variant="standard" id="31647"}
<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
>

<title>Octane</title>

<script src="/socket.io/socket.io.js"></script>

<style>

* {
    box-sizing: border-box;
}

body {

    margin: 0;

    overflow: hidden;

    background:
        #111;

    color:
        white;

    font-family:
        Arial,
        sans-serif;
}

canvas {

    display:
        block;

    background:
        #5d8f55;
}

#login {

    position:
        fixed;

    inset:
        0;

    display:
        flex;

    justify-content:
        center;

    align-items:
        center;

    background:
        #111;

    z-index:
        100;
}

.loginBox {

    width:
        350px;

    padding:
        35px;

    border-radius:
        15px;

    background:
        #222;

    text-align:
        center;

    box-shadow:
        0 10px 40px
        rgba(0,0,0,0.5);
}

.loginBox h1 {

    margin:
        0;

    font-size:
        48px;
}

.loginBox p {

    color:
        #bbb;
}

input {

    width:
        100%;

    padding:
        12px;

    margin:
        10px 0;

    border:
        none;

    border-radius:
        6px;

    font-size:
        16px;
}

button {

    padding:
        10px 15px;

    margin:
        4px;

    border:
        none;

    border-radius:
        6px;

    background:
        #e33;

    color:
        white;

    font-weight:
        bold;

    cursor:
        pointer;
}

button:hover {

    filter:
        brightness(1.2);
}

#hud {

    position:
        fixed;

    top:
        10px;

    left:
        10px;

    padding:
        12px;

    min-width:
        220px;

    border-radius:
        10px;

    background:
        rgba(0,0,0,0.8);

    z-index:
        10;
}

#hud h1 {

    margin:
        0 0 8px;

    font-size:
        24px;
}

.stat {

    margin:
        4px 0;
}

#controls {

    position:
        fixed;

    bottom:
        10px;

    left:
        10px;

    padding:
        10px;

    border-radius:
        8px;

    background:
        rgba(0,0,0,0.75);

    z-index:
        10;
}

#menu {

    position:
        fixed;

    top:
        10px;

    right:
        10px;

    width:
        220px;

    padding:
        10px;

    border-radius:
        10px;

    background:
        rgba(0,0,0,0.8);

    z-index:
        10;
}

#menu h3 {

    margin:
        5px 0;
}

#message {

    position:
        fixed;

    left:
        50%;

    bottom:
        60px;

    transform:
        translateX(-50%);

    padding:
        12px 20px;

    border-radius:
        8px;

    background:
        rgba(0,0,0,0.85);

    display:
        none;

    z-index:
        20;
}

#error {

    color:
        #ff6666;

    margin:
        10px;
}

</style>

</head>

<body>

<div id="login">

    <div class="loginBox">

        <h1>⛽</h1>

        <h2>OCTANE</h2>

        <p>
            Run the station.
            Work together.
            Make money.
        </p>

        <p>
            <b>Starting Cash: $100</b>
        </p>

        <input
            id="nameInput"
            placeholder="Enter your name"
            maxlength="20"
        >

        <button onclick="joinGame()">
            Enter Station
        </button>

        <div id="error"></div>

    </div>

</div>

<canvas id="gameCanvas"></canvas>

<div id="hud">

    <h1>⛽ OCTANE</h1>

    <div class="stat">
        💰 $<span id="money">100</span>
    </div>

    <div class="stat">
        ⛽ Fuel:
        <span id="fuel">40/100</span>
    </div>

    <div class="stat">
        📦 Store:
        <span id="stock">20/40</span>
    </div>

    <div class="stat">
        🧹 Clean:
        <span id="clean">100</span>%
    </div>

    <div class="stat">
        📅 Day:
        <span id="day">1</span>
    </div>

    <div class="stat">
        🕐 <span id="time">08:00</span>
    </div>

    <div class="stat">
        👥 Players:
        <span id="players">0/4</span>
    </div>

</div>

<div id="menu">

    <h3>Station</h3>

    <button onclick="hireBot()">
        🤖 Hire Worker ($50)
    </button>

    <hr>

    <h3>Upgrades</h3>

    <button onclick="upgrade('pump')">
        ⛽ Add Pump ($250)
    </button>

    <button onclick="upgrade('shelves')">
        🛒 Expand Store ($200)
    </button>

    <button onclick="upgrade('employees')">
        👷 More Workers ($300)
    </button>

</div>

<div id="controls">

    <b>WASD / Arrow Keys</b>
    <br>
    Move around
    <br>
    <b>E</b>
    Interact

</div>

<div id="message"></div>

<script>

const socket =
    io();

const canvas =
    document.getElementById(
        "gameCanvas"
    );

const ctx =
    canvas.getContext(
        "2d"
    );

let myId =
    null;

let state = {

    players: {},

    bots: {},

    customers: {},

    money: 100,

    fuel: 40,

    maxFuel: 100,

    storeStock: 20,

    maxStoreStock: 40,

    cleanliness: 100,

    day: 1,

    time: "08:00",

    upgrades: {

        pumps: 2,

        storeShelves: 2,

        employeeSlots: 2

    }

};

const keys = {};

let camera = {

    x: 0,

    y: 0

};

/*
=========================================================
LOGIN
=========================================================
*/

function joinGame() {

    const input =
        document.getElementById(
            "nameInput"
        );

    const name =
        input.value.trim();

    if (!name) {

        document.getElementById(
            "error"
        ).textContent =
            "Enter your name!";

        return;
    }

    socket.emit(
        "joinGame",
        name
    );
}

socket.on(
    "joined",
    data => {

        myId =
            data.id;

        document.getElementById(
            "login"
        ).style.display =
            "none";
    }
);

socket.on(
    "joinError",
    message => {

        document.getElementById(
            "error"
        ).textContent =
            message;
    }
);

/*
=========================================================
KEYBOARD
=========================================================
*/

window.addEventListener(
    "keydown",
    e => {

        const key =
            e.key.toLowerCase();

        keys[key] =
            true;

        if (
            key === "e" &&
            !e.repeat
        ) {

            socket.emit(
                "interact"
            );
        }
    }
);

window.addEventListener(
    "keyup",
    e => {

        keys[
            e.key.toLowerCase()
        ] =
            false;
    }
);

/*
=========================================================
MOVEMENT
=========================================================
*/

setInterval(
    () => {

        socket.emit(
            "move",
            {

                up:
                    keys["w"] ||
                    keys["arrowup"],

                down:
                    keys["s"] ||
                    keys["arrowdown"],

                left:
                    keys["a"] ||
                    keys["arrowleft"],

                right:
                    keys["d"] ||
                    keys["arrowright"]

            }
        );

    },
    50
);

/*
=========================================================
SERVER STATE
=========================================================
*/

socket.on(
    "gameState",
    newState => {

        state =
            newState;

        updateHUD();

    }
);

function updateHUD() {

    document.getElementById(
        "money"
    ).textContent =
        state.money;

    document.getElementById(
        "fuel"
    ).textContent =
        `${state.fuel}/${state.maxFuel}`;

    document.getElementById(
        "stock"
    ).textContent =
        `${state.storeStock}/${state.maxStoreStock}`;

    document.getElementById(
        "clean"
    ).textContent =
        state.cleanliness;

    document.getElementById(
        "day"
    ).textContent =
        state.day;

    document.getElementById(
        "time"
    ).textContent =
        state.time;

    document.getElementById(
        "players"
    ).textContent =
        `${state.playerCount}/${state.maxPlayers}`;
}

/*
=========================================================
BUTTONS
=========================================================
*/

function hireBot() {

    socket.emit(
        "hireBot"
    );
}

function upgrade(type) {

    socket.emit(
        "upgrade",
        type
    );
}

/*
=========================================================
CANVAS
=========================================================
*/

function resize() {

    canvas.width =
        window.innerWidth;

    canvas.height =
        window.innerHeight;
}

window.addEventListener(
    "resize",
    resize
);

resize();

/*
=========================================================
CAMERA
=========================================================
*/

function updateCamera() {

    const player =
        state.players[
            myId
        ];

    if (!player) {
        return;
    }

    camera.x =
        player.x -
        canvas.width / 2;

    camera.y =
        player.y -
        canvas.height / 2;

    camera.x =
        Math.max(
            0,
            Math.min(
                WORLD_WIDTH -
                canvas.width,

                camera.x
            )
        );

    camera.y =
        Math.max(
            0,
            Math.min(
                WORLD_HEIGHT -
                canvas.height,

                camera.y
            )
        );
}

/*
=========================================================
WORLD CONSTANTS
=========================================================
*/

const WORLD_WIDTH =
    1400;

const WORLD_HEIGHT =
    800;

/*
=========================================================
DRAW STATION
=========================================================
*/

function drawStation() {

    /*
    Ground
    */

    ctx.fillStyle =
        "#5d8f55";

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    /*
    Road
    */

    ctx.fillStyle =
        "#444";

    ctx.fillRect(
        -camera.x,
        0 - camera.y,
        WORLD_WIDTH,
        130
    );

    ctx.fillRect(
        -camera.x,
        650 - camera.y,
        WORLD_WIDTH,
        150
    );

    /*
    Station building
    */

    ctx.fillStyle =
        "#d5d5d5";

    ctx.fillRect(
        350 - camera.x,
        170 - camera.y,
        550,
        430
    );

    /*
    Roof
    */

    ctx.fillStyle =
        "#d83232";

    ctx.fillRect(
        350 - camera.x,
        170 - camera.y,
        550,
        65
    );

    ctx.fillStyle =
        "white";

    ctx.font =
        "bold 32px Arial";

    ctx.textAlign =
        "center";

    ctx.fillText(
        "OCTANE",
        625 - camera.x,
        215 - camera.y
    );

    /*
    Register
    */

    ctx.fillStyle =
        "#333";

    ctx.fillRect(
        470 - camera.x,
        230 - camera.y,
        120,
        80
    );

    ctx.fillStyle =
        "white";

    ctx.font =
        "16px Arial";

    ctx.fillText(
        "REGISTER",
        530 - camera.x,
        275 - camera.y
    );

    /*
    Shelves
    */

    ctx.fillStyle =
        "#8b5a2b";

    ctx.fillRect(
        680 - camera.x,
        230 - camera.y,
        150,
        200
    );

    ctx.fillStyle =
        "white";

    ctx.fillText(
        "STORE",
        755 - camera.x,
        330 - camera.y
    );

    /*
    Storage
    */

    ctx.fillStyle =
        "#704214";

    ctx.fillRect(
        390 - camera.x,
        450 - camera.y,
        150,
        100
    );

    ctx.fillStyle =
        "white";

    ctx.fillText(
        "STORAGE",
        465 - camera.x,
        505 - camera.y
    );

    /*
    Cleaning
    */

    ctx.fillStyle =
        "#2288aa";

    ctx.fillRect(
        570 - camera.x,
        500 - camera.y,
        120,
        70
    );

    ctx.fillStyle =
        "white";

    ctx.fillText(
        "CLEAN",
        630 - camera.x,
        540 - camera.y
    );

    /*
    Pumps
    */

    for (
        let i = 0;
        i <
        state.upgrades.pumps;
        i++
    ) {

        const pump =
            getPumpPosition(
                i
            );

        ctx.fillStyle =
            "#333";

        ctx.fillRect(
            pump.x -
            30 -
            camera.x,

            pump.y -
            50 -
            camera.y,

            60,
            100
        );

        ctx.fillStyle =
            "#e33";

        ctx.fillRect(
            pump.x -
            20 -
            camera.x,

            pump.y -
            40 -
            camera.y,

            40,
            30
        );

        ctx.fillStyle =
            "white";

        ctx.fillText(
            "PUMP " +
            (i + 1),

            pump.x -
            camera.x,

            pump.y +
            20 -
            camera.y
        );
    }
}

function getPumpPosition(
    index
) {

    if (
        index === 0
    ) {

        return {
            x: 980,
            y: 230
        };
    }

    if (
        index === 1
    ) {

        return {
            x: 1120,
            y: 230
        };
    }

    return {
        x:
            980 +
            index *
            70,

        y:
            230
    };
}

/*
=========================================================
DRAW ENTITY
=========================================================
*/

function drawEntity(
    entity,
    color,
    label
) {

    const x =
        entity.x -
        camera.x;

    const y =
        entity.y -
        camera.y;

    ctx.fillStyle =
        "rgba(0,0,0,0.25)";

    ctx.beginPath();

    ctx.ellipse(
        x,
        y + 12,
        14,
        6,
        0,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle =
        color;

    ctx.beginPath();

    ctx.arc(
        x,
        y,
        15,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.strokeStyle =
        "white";

    ctx.lineWidth =
        2;

    ctx.stroke();

    ctx.fillStyle =
        "white";

    ctx.font =
        "12px Arial";

    ctx.textAlign =
        "center";

    ctx.fillText(
        label,
        x,
        y - 22
    );
}

/*
=========================================================
DRAW PLAYERS
=========================================================
*/

function drawPlayers() {

    for (
        const player of
        Object.values(
            state.players || {}
        )
    ) {

        drawEntity(
            player,

            player.color,

            player.name
        );
    }
}

/*
=========================================================
DRAW BOTS
=========================================================
*/

function drawBots() {

    for (
        const bot of
        Object.values(
            state.bots || {}
        )
    ) {

        drawEntity(
            bot,

            "#9b59b6",

            "🤖 " +
            bot.name
        );
    }
}

/*
=========================================================
DRAW CUSTOMERS
=========================================================
*/

function drawCustomers() {

    for (
        const customer of
        Object.values(
            state.customers || {}
        )
    ) {

        let color =
            "#f5a623";

        if (
            customer.state ===
            "leaving"
        ) {

            color =
                "#777";
        }

        drawEntity(
            customer,

            color,

            "Customer"
        );
    }
}

/*
=========================================================
GAME LOOP
=========================================================
*/

function gameLoop() {

    updateCamera();

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    drawStation();

    drawCustomers();

    drawBots();

    drawPlayers();

    requestAnimationFrame(
        gameLoop
    );
}

gameLoop();

</script>

</body>

</html>
```

---

# `package.json`

{
"name": "octane",
"version": "1.0.0",
"description": "Octane - a cooperative multiplayer gas station management game",
"main": "server.js",
"scripts": {
"start": "node server.js"
},
"dependencies": {
"express": "^5.1.0",
"socket.io": "^4.8.1"
}
}
