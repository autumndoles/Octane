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

const game = {
    money: 100,
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

const AREAS = {
    building: {
        x: 350,
        y: 170,
        width: 550,
        height: 430
    },

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
};

function random(min, max) {
    return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function formatTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);

    return (
        String(hours).padStart(2, "0") +
        ":" +
        String(mins).padStart(2, "0")
    );
}

function collidesWithBuilding(x, y) {
    const b = AREAS.building;

    if (
        x > b.x &&
        x < b.x + b.width &&
        y > b.y &&
        y < b.y + b.height
    ) {
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
}

function isBlocked(x, y) {
    if (
        x < 20 ||
        x > WORLD.width - 20 ||
        y < 20 ||
        y > WORLD.height - 20
    ) {
        return true;
    }

    return collidesWithBuilding(x, y);
}

function moveTowards(entity, targetX, targetY, speed) {
    const dx = targetX - entity.x;
    const dy = targetY - entity.y;

    const length = Math.sqrt(
        dx * dx + dy * dy
    );

    if (length < 2) {
        return true;
    }

    entity.x +=
        (dx / length) * speed;

    entity.y +=
        (dy / length) * speed;

    return false;
}

function createCustomer() {
    const id =
        `customer-${game.nextCustomerId++}`;

    const pumpIndex =
        Math.floor(
            Math.random() *
            game.upgrades.pumps
        );

    const pump =
        AREAS.pumps[pumpIndex];

    game.customers[id] = {
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

        shopping:
            Math.random() < 0.5,

        payment: 0
    };
}

function interactWithPlayer(player) {

    // Fuel pumps

    for (
        let i = 0;
        i < game.upgrades.pumps;
        i++
    ) {
        const pump =
            AREAS.pumps[i];

        const distance =
            Math.hypot(
                player.x - pump.x,
                player.y - pump.y
            );

        if (distance < 70) {

            const customer =
                Object.values(
                    game.customers
                ).find(
                    c =>
                        c.pumpIndex === i &&
                        c.state === "waitingForFuel"
                );

            if (
                customer &&
                game.fuel > 0
            ) {
                customer.state =
                    "fueling";

                customer.fuelProgress =
                    0;

                player.currentAction =
                    "fueling";

                return;
            }
        }
    }

    // Register

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

    // Restocking

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

    // Cleaning

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

    // Store

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
}

io.on("connection", socket => {

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

                x:
                    650 +
                    playerIndex * 35,

                y: 650,

                color:
                    PLAYER_COLORS[
                        playerIndex
                    ],

                currentAction:
                    "idle"
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

    socket.on(
        "upgrade",
        type => {

            if (
                type === "pump" &&
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

            if (
                type === "shelves" &&
                game.money >= 200
            ) {

                game.money -= 200;

                game.upgrades.storeShelves++;

                game.maxStoreStock += 20;
            }

            if (
                type === "employees" &&
                game.money >= 300 &&
                game.upgrades.employeeSlots < 6
            ) {

                game.money -= 300;

                game.upgrades.employeeSlots++;
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
});

function updateBots() {

    for (
        const bot of
        Object.values(
            game.bots
        )
    ) {

        bot.actionTimer++;

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
    }
}

function updateCustomers() {

    for (
        const customer of
        Object.values(
            game.customers
        )
    ) {

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

            customer.fuelProgress++;

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

            if (arrived) {

                customer.patience -=
                    0.2;
            }
        }

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

    if (
        Object.keys(
            game.customers
        ).length < 8 &&
        Math.random() < 0.03
    ) {

        createCustomer();
    }
}

function updateTime() {

    game.dayTime += 0.2;

    if (
        game.dayTime >=
        24 * 60
    ) {

        game.dayTime = 0;

        game.day++;

        game.money -= 25;

        if (
            game.money < 0
        ) {
            game.money = 0;
        }
    }

    game.cleanliness =
        Math.max(
            0,
            game.cleanliness - 0.005
        );
}

function getState() {

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
}

function broadcastState() {

    io.emit(
        "gameState",
        getState()
    );
}

setInterval(
    () => {

        updateBots();

        updateCustomers();

        updateTime();

        broadcastState();

    },
    1000 / 20
);

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "index.html"
            )
        );
    }
);

server.listen(
    PORT,
    () => {

        console.log(
            `Octane running on port ${PORT}`
        );

    }
);
