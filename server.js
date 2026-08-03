const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    transports: ["websocket", "polling"],
    pingInterval: 10000,
    pingTimeout: 5000
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

const MAX_PLAYERS = 4;
const MAX_CUSTOMERS = 8;
const TICK_RATE = 12;
const STATE_RATE = 10;

const WORLD = {
    width: 1400,
    height: 800
};

const PLAYER_COLORS = [
    "#ff5555",
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

const JOBS = [
    "fuel",
    "cashier",
    "restocker",
    "cleaner"
];

const rooms = {};

function generateRoomCode() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

    do {

        code = "";

        for (
            let i = 0;
            i < 4;
            i++
        ) {

            code +=
                chars[
                    Math.floor(
                        Math.random() *
                        chars.length
                    )
                ];
        }

    } while (rooms[code]);

    return code;
}

function createRoom(hostId) {

    const code =
        generateRoomCode();

    rooms[code] = {

        code,

        hostId,

        started: false,

        money: 100,

        fuel: 40,

        maxFuel: 100,

        storeStock: 20,

        maxStoreStock: 40,

        cleanliness: 100,

        day: 1,

        time: 8 * 60,

        players: {},

        bots: {},

        customers: {},

        nextBotId: 1,

        nextCustomerId: 1,

        upgrades: {

            pumps: 2,

            storeShelves: 1,

            employeeSlots: 2
        }

    };

    return rooms[code];
}

function getRoomForSocket(socketId) {

    for (
        const room of
        Object.values(rooms)
    ) {

        if (
            room.players[socketId]
        ) {

            return room;
        }
    }

    return null;
}

function sanitizeName(name) {

    return String(name || "")
        .trim()
        .substring(0, 20)
        .replace(
            /[<>]/g,
            ""
        ) || "Player";
}

function formatTime(minutes) {

    const hours =
        Math.floor(
            minutes / 60
        );

    const mins =
        Math.floor(
            minutes % 60
        );

    return (
        String(hours)
            .padStart(2, "0") +
        ":" +
        String(mins)
            .padStart(2, "0")
    );
}

function distance(a, b) {

    return Math.hypot(
        a.x - b.x,
        a.y - b.y
    );
}

function isInsideBuilding(x, y) {

    return (
        x > 350 &&
        x < 900 &&
        y > 170 &&
        y < 600
    );
}

function isDoor(x, y) {

    return (
        x > 580 &&
        x < 680 &&
        y > 560
    );
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

    if (
        isInsideBuilding(x, y) &&
        !isDoor(x, y)
    ) {

        return true;
    }

    return false;
}

function moveEntity(
    entity,
    dx,
    dy
) {

    const speed =
        entity.speed || 3;

    const newX =
        entity.x +
        dx * speed;

    const newY =
        entity.y +
        dy * speed;

    if (
        !isBlocked(
            newX,
            entity.y
        )
    ) {

        entity.x = newX;
    }

    if (
        !isBlocked(
            entity.x,
            newY
        )
    ) {

        entity.y = newY;
    }
}

function moveTowards(
    entity,
    targetX,
    targetY,
    speed
) {

    const dx =
        targetX -
        entity.x;

    const dy =
        targetY -
        entity.y;

    const length =
        Math.hypot(
            dx,
            dy
        );

    if (
        length < 5
    ) {

        return true;
    }

    entity.x +=
        dx / length *
        speed;

    entity.y +=
        dy / length *
        speed;

    return false;
}

function getPump(index) {

    const pumps = [

        {
            x: 980,
            y: 230
        },

        {
            x: 1120,
            y: 230
        },

        {
            x: 1260,
            y: 230
        },

        {
            x: 1330,
            y: 230
        }

    ];

    return pumps[index];
}

function createCustomer(room) {

    if (
        Object.keys(
            room.customers
        ).length >=
        MAX_CUSTOMERS
    ) {

        return;
    }

    const id =
        `customer-${room.nextCustomerId++}`;

    const pumpIndex =
        Math.floor(
            Math.random() *
            room.upgrades.pumps
        );

    const pump =
        getPump(pumpIndex);

    room.customers[id] = {

        id,

        x: 650,

        y: 700,

        state: "toPump",

        pumpIndex,

        targetX: pump.x,

        targetY:
            pump.y + 70,

        fuelNeeded:
            Math.floor(
                8 +
                Math.random() *
                12
            ),

        fuelProgress: 0,

        patience: 100,

        wantsStore:
            Math.random() <
            0.55,

        payment: 0,

        speed: 1.5

    };
}

function findFuelCustomer(
    room,
    pumpIndex
) {

    return Object.values(
        room.customers
    ).find(
        customer =>
            customer.pumpIndex ===
            pumpIndex &&
            customer.state ===
            "waitingFuel"
    );
}

function findCheckoutCustomer(
    room
) {

    return Object.values(
        room.customers
    ).find(
        customer =>
            customer.state ===
            "waitingCheckout"
    );
}

function handleInteraction(
    room,
    player
) {

    // Fuel pumps

    for (
        let i = 0;
        i < room.upgrades.pumps;
        i++
    ) {

        const pump =
            getPump(i);

        if (
            distance(
                player,
                pump
            ) < 80
        ) {

            const customer =
                findFuelCustomer(
                    room,
                    i
                );

            if (
                customer &&
                room.fuel > 0
            ) {

                customer.state =
                    "fueling";

                customer.fueledBy =
                    player.id;

                player.action =
                    "fueling";

                return;
            }
        }
    }

    // Register

    if (
        distance(
            player,
            {
                x: 530,
                y: 270
            }
        ) < 80
    ) {

        const customer =
            findCheckoutCustomer(
                room
            );

        if (customer) {

            customer.state =
                "checkingOut";

            customer.checkoutProgress =
                0;

            player.action =
                "cashier";

            return;
        }
    }

    // Store

    if (
        distance(
            player,
            {
                x: 755,
                y: 330
            }
        ) < 100
    ) {

        const customer =
            Object.values(
                room.customers
            ).find(
                c =>
                    c.state ===
                    "shopping"
            );

        if (
            customer &&
            room.storeStock > 0
        ) {

            room.storeStock--;

            customer.state =
                "waitingCheckout";

            customer.payment = 8;

            player.action =
                "store";

            return;
        }
    }

    // Storage

    if (
        distance(
            player,
            {
                x: 465,
                y: 500
            }
        ) < 100
    ) {

        if (
            room.money >= 20 &&
            room.storeStock <
            room.maxStoreStock
        ) {

            room.money -= 20;

            room.storeStock =
                Math.min(
                    room.maxStoreStock,
                    room.storeStock +
                    10
                );

            player.action =
                "restocking";

            return;
        }
    }

    // Cleaning

    if (
        distance(
            player,
            {
                x: 630,
                y: 535
            }
        ) < 90
    ) {

        room.cleanliness =
            Math.min(
                100,
                room.cleanliness +
                15
            );

        player.action =
            "cleaning";
    }
}

function updateCustomers(
    room
) {

    for (
        const customer of
        Object.values(
            room.customers
        )
    ) {

        if (
            customer.state ===
            "toPump"
        ) {

            const arrived =
                moveTowards(
                    customer,
                    customer.targetX,
                    customer.targetY,
                    customer.speed
                );

            if (arrived) {

                customer.state =
                    "waitingFuel";
            }
        }

        else if (
            customer.state ===
            "fueling"
        ) {

            if (
                room.fuel <= 0
            ) {

                customer.state =
                    "leaving";

                continue;
            }

            customer.fuelProgress +=
                2;

            room.fuel =
                Math.max(
                    0,
                    room.fuel -
                    customer.fuelNeeded /
                    50
                );

            if (
                customer.fuelProgress >=
                100
            ) {

                room.money +=
                    customer.fuelNeeded *
                    2;

                if (
                    customer.wantsStore
                ) {

                    customer.state =
                        "shopping";

                    customer.targetX =
                        755;

                    customer.targetY =
                        330;

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
                    customer.speed
                );

            if (
                arrived &&
                room.storeStock <= 0
            ) {

                customer.state =
                    "leaving";
            }
        }

        else if (
            customer.state ===
            "checkingOut"
        ) {

            customer.checkoutProgress +=
                2;

            if (
                customer.checkoutProgress >=
                100
            ) {

                room.money +=
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
                    650,
                    700,
                    2
                );

            if (arrived) {

                delete room.customers[
                    customer.id
                ];
            }
        }

        if (
            customer.state !==
            "leaving"
        ) {

            customer.patience -=
                0.015;

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
            room.customers
        ).length <
        MAX_CUSTOMERS
    ) {

        if (
            Math.random() <
            0.035
        ) {

            createCustomer(
                room
            );
        }
    }
}

function updateBots(room) {

    for (
        const bot of
        Object.values(
            room.bots
        )
    ) {

        bot.actionTimer++;

        if (
            bot.job ===
            "fuel"
        ) {

            const customer =
                Object.values(
                    room.customers
                ).find(
                    c =>
                        c.state ===
                        "waitingFuel"
                );

            if (customer) {

                const pump =
                    getPump(
                        customer.pumpIndex
                    );

                const arrived =
                    moveTowards(
                        bot,
                        pump.x,
                        pump.y + 70,
                        2
                    );

                if (
                    arrived &&
                    room.fuel > 0
                ) {

                    customer.state =
                        "fueling";

                    customer.fueledBy =
                        bot.id;
                }
            }
        }

        else if (
            bot.job ===
            "cashier"
        ) {

            const customer =
                findCheckoutCustomer(
                    room
                );

            if (customer) {

                const arrived =
                    moveTowards(
                        bot,
                        530,
                        270,
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

        else if (
            bot.job ===
            "restocker"
        ) {

            if (
                room.storeStock <
                room.maxStoreStock &&
                room.money >= 20
            ) {

                const arrived =
                    moveTowards(
                        bot,
                        465,
                        500,
                        2
                    );

                if (
                    arrived &&
                    bot.actionTimer >
                    120
                ) {

                    room.money -= 20;

                    room.storeStock =
                        Math.min(
                            room.maxStoreStock,
                            room.storeStock +
                            10
                        );

                    bot.actionTimer = 0;
                }
            }
        }

        else if (
            bot.job ===
            "cleaner"
        ) {

            if (
                room.cleanliness <
                80
            ) {

                const arrived =
                    moveTowards(
                        bot,
                        630,
                        535,
                        2
                    );

                if (
                    arrived &&
                    bot.actionTimer >
                    60
                ) {

                    room.cleanliness =
                        Math.min(
                            100,
                            room.cleanliness +
                            10
                        );

                    bot.actionTimer = 0;
                }
            }
        }
    }
}

function updateTime(room) {

    if (
        !room.started
    ) {

        return;
    }

    room.time += 0.15;

    if (
        room.time >=
        24 * 60
    ) {

        room.time = 0;

        room.day++;

        room.money =
            Math.max(
                0,
                room.money - 25
            );
    }

    room.cleanliness =
        Math.max(
            0,
            room.cleanliness -
            0.003
        );
}

function getState(room) {

    return {

        roomCode:
            room.code,

        hostId:
            room.hostId,

        started:
            room.started,

        money:
            Math.floor(
                room.money
            ),

        fuel:
            Math.floor(
                room.fuel
            ),

        maxFuel:
            room.maxFuel,

        storeStock:
            room.storeStock,

        maxStoreStock:
            room.maxStoreStock,

        cleanliness:
            Math.floor(
                room.cleanliness
            ),

        day:
            room.day,

        time:
            formatTime(
                room.time
            ),

        players:
            room.players,

        bots:
            room.bots,

        customers:
            room.customers,

        upgrades:
            room.upgrades,

        playerCount:
            Object.keys(
                room.players
            ).length,

        maxPlayers:
            MAX_PLAYERS
    };
}

function broadcastRoom(
    room
) {

    io.to(
        room.code
    ).emit(
        "gameState",
        getState(room)
    );
}

io.on(
    "connection",
    socket => {

        socket.on(
            "createRoom",
            name => {

                const room =
                    createRoom(
                        socket.id
                    );

                joinRoom(
                    socket,
                    room,
                    name
                );
            }
        );

        socket.on(
            "joinRoom",
            data => {

                const code =
                    String(
                        data.code ||
                        ""
                    )
                    .trim()
                    .toUpperCase();

                const room =
                    rooms[code];

                if (!room) {

                    socket.emit(
                        "roomError",
                        "Room not found."
                    );

                    return;
                }

                if (
                    Object.keys(
                        room.players
                    ).length >=
                    MAX_PLAYERS
                ) {

                    socket.emit(
                        "roomError",
                        "That room is full."
                    );

                    return;
                }

                if (
                    room.started
                ) {

                    socket.emit(
                        "roomError",
                        "That game has already started."
                    );

                    return;
                }

                joinRoom(
                    socket,
                    room,
                    data.name
                );
            }
        );

        socket.on(
            "startGame",
            () => {

                const room =
                    getRoomForSocket(
                        socket.id
                    );

                if (!room) {
                    return;
                }

                if (
                    room.hostId !==
                    socket.id
                ) {
                    return;
                }

                if (
                    Object.keys(
                        room.players
                    ).length < 1
                ) {
                    return;
                }

                room.started = true;

                broadcastRoom(
                    room
                );
            }
        );

        socket.on(
            "move",
            data => {

                const room =
                    getRoomForSocket(
                        socket.id
                    );

                if (
                    !room ||
                    !room.started
                ) {
                    return;
                }

                const player =
                    room.players[
                        socket.id
                    ];

                if (!player) {
                    return;
                }

                let dx = 0;
                let dy = 0;

                if (data.up) dy--;

                if (data.down) dy++;

                if (data.left) dx--;

                if (data.right) dx++;

                if (
                    dx !== 0 &&
                    dy !== 0
                ) {

                    dx *= 0.707;

                    dy *= 0.707;
                }

                moveEntity(
                    player,
                    dx,
                    dy
                );
            }
        );

        socket.on(
            "interact",
            () => {

                const room =
                    getRoomForSocket(
                        socket.id
                    );

                if (
                    !room ||
                    !room.started
                ) {
                    return;
                }

                const player =
                    room.players[
                        socket.id
                    ];

                if (player) {

                    handleInteraction(
                        room,
                        player
                    );
                }
            }
        );

        socket.on(
            "hireBot",
            job => {

                const room =
                    getRoomForSocket(
                        socket.id
                    );

                if (
                    !room ||
                    !room.started
                ) {
                    return;
                }

                if (
                    !JOBS.includes(job)
                ) {
                    return;
                }

                if (
                    Object.keys(
                        room.bots
                    ).length >=
                    room.upgrades.employeeSlots
                ) {
                    return;
                }

                if (
                    room.money < 50
                ) {
                    return;
                }

                room.money -= 50;

                const id =
                    `bot-${room.nextBotId++}`;

                room.bots[id] = {

                    id,

                    name:
                        BOT_NAMES[
                            Math.floor(
                                Math.random() *
                                BOT_NAMES.length
                            )
                        ],

                    x: 650,

                    y: 700,

                    job,

                    actionTimer: 0

                };

                broadcastRoom(
                    room
                );
            }
        );

        socket.on(
            "upgrade",
            type => {

                const room =
                    getRoomForSocket(
                        socket.id
                    );

                if (
                    !room ||
                    !room.started
                ) {
                    return;
                }

                if (
                    type === "pump" &&
                    room.money >= 250 &&
                    room.upgrades.pumps < 4
                ) {

                    room.money -= 250;

                    room.upgrades.pumps++;
                }

                else if (
                    type === "shelves" &&
                    room.money >= 200
                ) {

                    room.money -= 200;

                    room.upgrades.storeShelves++;

                    room.maxStoreStock += 20;
                }

                else if (
                    type === "employees" &&
                    room.money >= 300 &&
                    room.upgrades.employeeSlots < 6
                ) {

                    room.money -= 300;

                    room.upgrades.employeeSlots++;
                }

                broadcastRoom(
                    room
                );
            }
        );

        socket.on(
            "disconnect",
            () => {

                const room =
                    getRoomForSocket(
                        socket.id
                    );

                if (!room) {
                    return;
                }

                delete room.players[
                    socket.id
                ];

                socket.leave(
                    room.code
                );

                if (
                    socket.id ===
                    room.hostId
                ) {

                    const remaining =
                        Object.keys(
                            room.players
                        );

                    if (
                        remaining.length > 0
                    ) {

                        room.hostId =
                            remaining[0];

                    } else {

                        delete rooms[
                            room.code
                        ];

                        return;
                    }
                }

                broadcastRoom(
                    room
                );
            }
        );
    }
);

function joinRoom(
    socket,
    room,
    name
) {

    const playerIndex =
        Object.keys(
            room.players
        ).length;

    socket.join(
        room.code
    );

    room.players[
        socket.id
    ] = {

        id:
            socket.id,

        name:
            sanitizeName(name),

        x:
            620 +
            playerIndex * 35,

        y:
            650,

        color:
            PLAYER_COLORS[
                playerIndex
            ],

        action:
            "idle",

        speed:
            3

    };

    socket.emit(
        "roomJoined",
        {

            roomCode:
                room.code,

            hostId:
                room.hostId,

            playerId:
                socket.id

        }
    );

    broadcastRoom(
        room
    );
}

setInterval(
    () => {

        for (
            const room of
            Object.values(rooms)
        ) {

            if (
                !room.started
            ) {
                continue;
            }

            updateCustomers(
                room
            );

            updateBots(
                room
            );

            updateTime(
                room
            );
        }

    },
    1000 / TICK_RATE
);

setInterval(
    () => {

        for (
            const room of
            Object.values(rooms)
        ) {

            broadcastRoom(
                room
            );
        }

    },
    1000 / STATE_RATE
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
            `Octane server running on port ${PORT}`
        );
    }
);
