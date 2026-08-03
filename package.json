const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    transports: ["websocket", "polling"],
    pingInterval: 10000,
    pingTimeout: 5000
});

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

const MAX_PLAYERS = 4;
const WORLD_WIDTH = 1400;
const WORLD_HEIGHT = 800;

const TICK_RATE = 15;
const STATE_RATE = 8;

const rooms = {};

const COLORS = [
    "#ff5555",
    "#4dabf7",
    "#51cf66",
    "#fcc419"
];

const BOT_JOBS = [
    "fuel",
    "cashier",
    "restocker",
    "cleaner"
];

const BOT_NAMES = [
    "Alex",
    "Sam",
    "Jamie",
    "Riley",
    "Casey",
    "Morgan"
];

const PUMPS = [
    { x: 980, y: 230 },
    { x: 1120, y: 230 },
    { x: 1260, y: 230 },
    { x: 1330, y: 230 }
];

const SHELF = {
    x: 750,
    y: 330
};

const REGISTER = {
    x: 530,
    y: 270
};

const STORAGE = {
    x: 450,
    y: 500
};

const CLEANING = {
    x: 630,
    y: 535
};

const DELIVERY = {
    x: 650,
    y: 700
};

function randomRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;

    do {
        code = "";

        for (let i = 0; i < 4; i++) {
            code += chars[
                Math.floor(Math.random() * chars.length)
            ];
        }
    } while (rooms[code]);

    return code;
}

function createRoom() {
    const code = randomRoomCode();

    rooms[code] = {
        code,
        hostId: null,
        started: false,

        money: 100,

        fuel: 40,
        maxFuel: 100,

        storeStock: 20,
        maxStoreStock: 40,

        boxes: 10,

        cleanliness: 100,

        day: 1,
        time: 8 * 60,

        players: {},
        bots: {},
        customers: {},

        nextBotId: 1,
        nextCustomerId: 1,

        tasks: [],

        upgrades: {
            pumps: 2,
            shelves: 1,
            employeeSlots: 2
        }
    };

    return rooms[code];
}

function getRoom(socketId) {
    for (const room of Object.values(rooms)) {
        if (room.players[socketId]) {
            return room;
        }
    }

    return null;
}

function cleanName(name) {
    return String(name || "Player")
        .trim()
        .substring(0, 20)
        .replace(/[<>]/g, "") || "Player";
}

function distance(a, b) {
    return Math.hypot(
        a.x - b.x,
        a.y - b.y
    );
}

function clamp(value, min, max) {
    return Math.max(
        min,
        Math.min(max, value)
    );
}

function isBlocked(x, y) {
    if (
        x < 20 ||
        x > WORLD_WIDTH - 20 ||
        y < 20 ||
        y > WORLD_HEIGHT - 20
    ) {
        return true;
    }

    // Main building
    if (
        x > 350 &&
        x < 900 &&
        y > 170 &&
        y < 600
    ) {
        // Front door
        if (
            x > 580 &&
            x < 680 &&
            y > 540
        ) {
            return false;
        }

        return true;
    }

    return false;
}

function movePlayer(player, dx, dy) {
    const speed = 3;

    const length = Math.hypot(dx, dy);

    if (length > 0) {
        dx /= length;
        dy /= length;
    }

    const newX = player.x + dx * speed;
    const newY = player.y + dy * speed;

    if (!isBlocked(newX, player.y)) {
        player.x = clamp(
            newX,
            20,
            WORLD_WIDTH - 20
        );
    }

    if (!isBlocked(player.x, newY)) {
        player.y = clamp(
            newY,
            20,
            WORLD_HEIGHT - 20
        );
    }
}

function getNearbyPump(player) {
    for (
        let i = 0;
        i < roomPumpCount(player.room);
        i++
    ) {
        if (
            distance(
                player,
                PUMPS[i]
            ) < 75
        ) {
            return i;
        }
    }

    return -1;
}

function roomPumpCount(room) {
    return room.upgrades.pumps;
}

function createCustomer(room) {
    if (
        Object.keys(room.customers).length >= 8
    ) {
        return;
    }

    const pumpIndex = Math.floor(
        Math.random() * room.upgrades.pumps
    );

    const pump = PUMPS[pumpIndex];

    const id =
        "customer-" +
        room.nextCustomerId++;

    room.customers[id] = {
        id,

        x: 650,
        y: 700,

        state: "entering",

        pumpIndex,

        targetX: pump.x,
        targetY: pump.y + 70,

        fuelNeeded:
            8 +
            Math.floor(
                Math.random() * 13
            ),

        fuelProgress: 0,

        checkoutProgress: 0,

        payment: 0,

        patience: 100,

        wantsStore:
            Math.random() < 0.6
    };
}

function createDirtySpot(room) {
    if (
        room.tasks.some(
            task =>
                task.type === "clean"
        )
    ) {
        return;
    }

    room.tasks.push({
        id:
            "clean-" +
            Date.now(),

        type: "clean",

        x:
            400 +
            Math.random() * 400,

        y:
            250 +
            Math.random() * 250,

        progress: 0
    });
}

function moveTowards(entity, x, y, speed) {
    const dx = x - entity.x;
    const dy = y - entity.y;

    const length = Math.hypot(dx, dy);

    if (length < 5) {
        return true;
    }

    entity.x +=
        dx / length * speed;

    entity.y +=
        dy / length * speed;

    return false;
}

function startPlayerTask(
    room,
    player
) {
    // Stop current task
    if (player.task) {
        return;
    }

    // Fueling
    const pumpIndex =
        getNearbyPump(player);

    if (pumpIndex !== -1) {
        const customer =
            Object.values(
                room.customers
            ).find(
                c =>
                    c.pumpIndex === pumpIndex &&
                    c.state === "waitingFuel"
            );

        if (customer) {
            player.task = {
                type: "fuel",
                customerId: customer.id
            };

            customer.state = "fueling";

            return;
        }
    }

    // Register
    if (
        distance(
            player,
            REGISTER
        ) < 80
    ) {
        const customer =
            Object.values(
                room.customers
            ).find(
                c =>
                    c.state === "waitingCheckout"
            );

        if (customer) {
            player.task = {
                type: "cashier",
                customerId: customer.id
            };

            customer.state =
                "checkingOut";

            return;
        }
    }

    // Pick up a restock box
    if (
        distance(
            player,
            STORAGE
        ) < 90 &&
        room.boxes > 0 &&
        !player.carrying
    ) {
        player.carrying = "box";

        return;
    }

    // Stock shelves
    if (
        distance(
            player,
            SHELF
        ) < 100 &&
        player.carrying === "box"
    ) {
        player.task = {
            type: "restock",
            progress: 0
        };

        return;
    }

    // Cleaning
    if (
        distance(
            player,
            CLEANING
        ) < 100
    ) {
        const spot =
            room.tasks.find(
                task =>
                    task.type === "clean"
            );

        if (spot) {
            player.task = {
                type: "clean",
                taskId: spot.id
            };

            return;
        }
    }

    // Fuel delivery
    if (
        distance(
            player,
            DELIVERY
        ) < 100 &&
        room.fuel < room.maxFuel
    ) {
        player.task = {
            type: "delivery",
            progress: 0
        };
    }
}

function updatePlayerTask(
    room,
    player
) {
    if (!player.task) {
        return;
    }

    const task = player.task;

    // Fueling
    if (task.type === "fuel") {
        const customer =
            room.customers[
                task.customerId
            ];

        if (!customer) {
            player.task = null;
            return;
        }

        if (room.fuel <= 0) {
            player.task = null;
            customer.state = "leaving";
            return;
        }

        room.fuel -= 0.15;

        customer.fuelProgress += 1.5;

        if (
            customer.fuelProgress >= 100
        ) {
            room.money +=
                customer.fuelNeeded * 2;

            if (customer.wantsStore) {
                customer.state = "shopping";
            } else {
                customer.state = "leaving";
            }

            player.task = null;
        }

        return;
    }

    // Cashier
    if (task.type === "cashier") {
        const customer =
            room.customers[
                task.customerId
            ];

        if (!customer) {
            player.task = null;
            return;
        }

        customer.checkoutProgress += 2;

        if (
            customer.checkoutProgress >= 100
        ) {
            room.money += customer.payment;

            customer.state = "leaving";

            player.task = null;
        }

        return;
    }

    // Restocking
    if (task.type === "restock") {
        task.progress += 2;

        if (task.progress >= 100) {
            room.storeStock =
                Math.min(
                    room.maxStoreStock,
                    room.storeStock + 10
                );

            room.boxes--;

            player.carrying = null;

            player.task = null;
        }

        return;
    }

    // Cleaning
    if (task.type === "clean") {
        const spot =
            room.tasks.find(
                t =>
                    t.id === task.taskId
            );

        if (!spot) {
            player.task = null;
            return;
        }

        task.progress += 3;

        if (task.progress >= 100) {
            room.cleanliness =
                Math.min(
                    100,
                    room.cleanliness + 15
                );

            room.tasks =
                room.tasks.filter(
                    t =>
                        t.id !== task.taskId
                );

            player.task = null;
        }

        return;
    }

    // Fuel delivery
    if (task.type === "delivery") {
        task.progress += 1;

        if (task.progress >= 100) {
            room.fuel =
                Math.min(
                    room.maxFuel,
                    room.fuel + 40
                );

            player.task = null;
        }
    }
}

function updateCustomers(room) {
    for (
        const customer of
        Object.values(room.customers)
    ) {
        if (
            customer.state ===
            "entering"
        ) {
            const pump =
                PUMPS[
                    customer.pumpIndex
                ];

            if (
                moveTowards(
                    customer,
                    pump.x,
                    pump.y + 70,
                    1.5
                )
            ) {
                customer.state =
                    "waitingFuel";
            }
        }

        else if (
            customer.state ===
            "shopping"
        ) {
            if (
                room.storeStock <= 0
            ) {
                customer.state =
                    "waitingCheckout";

                customer.payment = 0;

                continue;
            }

            if (
                moveTowards(
                    customer,
                    SHELF.x,
                    SHELF.y,
                    1.5
                )
            ) {
                room.storeStock--;

                customer.state =
                    "waitingCheckout";

                customer.payment = 8;
            }
        }

        else if (
            customer.state ===
            "leaving"
        ) {
            if (
                moveTowards(
                    customer,
                    650,
                    700,
                    2
                )
            ) {
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
                0.01;

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
        ).length < 8
    ) {
        if (
            Math.random() < 0.025
        ) {
            createCustomer(room);
        }
    }
}

function updateBots(room) {
    for (
        const bot of
        Object.values(room.bots)
    ) {
        if (
            bot.job === "fuel"
        ) {
            const customer =
                Object.values(
                    room.customers
                ).find(
                    c =>
                        c.state ===
                        "waitingFuel"
                );

            if (!customer) {
                continue;
            }

            const pump =
                PUMPS[
                    customer.pumpIndex
                ];

            if (
                moveTowards(
                    bot,
                    pump.x,
                    pump.y + 70,
                    2
                )
            ) {
                customer.state =
                    "fueling";

                room.fuel =
                    Math.max(
                        0,
                        room.fuel - 0.1
                    );

                customer.fuelProgress += 1;

                if (
                    customer.fuelProgress >=
                    100
                ) {
                    room.money +=
                        customer.fuelNeeded * 2;

                    customer.state =
                        customer.wantsStore
                            ? "shopping"
                            : "leaving";
                }
            }
        }

        else if (
            bot.job === "cashier"
        ) {
            const customer =
                Object.values(
                    room.customers
                ).find(
                    c =>
                        c.state ===
                        "waitingCheckout"
                );

            if (!customer) {
                continue;
            }

            if (
                moveTowards(
                    bot,
                    REGISTER.x,
                    REGISTER.y,
                    2
                )
            ) {
                customer.state =
                    "checkingOut";

                customer.checkoutProgress += 2;

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
        }

        else if (
            bot.job === "restocker"
        ) {
            if (
                room.storeStock <
                    room.maxStoreStock &&
                room.boxes > 0
            ) {
                if (
                    moveTowards(
                        bot,
                        STORAGE.x,
                        STORAGE.y,
                        2
                    )
                ) {
                    room.boxes--;

                    room.storeStock =
                        Math.min(
                            room.maxStoreStock,
                            room.storeStock + 10
                        );
                }
            }
        }

        else if (
            bot.job === "cleaner"
        ) {
            const spot =
                room.tasks.find(
                    t =>
                        t.type === "clean"
                );

            if (!spot) {
                continue;
            }

            if (
                moveTowards(
                    bot,
                    spot.x,
                    spot.y,
                    2
                )
            ) {
                room.cleanliness =
                    Math.min(
                        100,
                        room.cleanliness + 0.5
                    );
            }
        }
    }
}

function updateWorld(room) {
    if (!room.started) {
        return;
    }

    updateCustomers(room);

    updateBots(room);

    for (
        const player of
        Object.values(room.players)
    ) {
        updatePlayerTask(
            room,
            player
        );
    }

    room.time += 0.12;

    if (
        room.time >= 1440
    ) {
        room.time = 0;
        room.day++;

        room.boxes = 10;
    }

    room.cleanliness =
        Math.max(
            0,
            room.cleanliness - 0.003
        );

    if (
        Math.random() < 0.002
    ) {
        createDirtySpot(room);
    }

    // Automatic fuel delivery
    // boxes arrive as a simple supply.
    if (
        Math.random() < 0.0008
    ) {
        room.boxes =
            Math.min(
                30,
                room.boxes + 5
            );
    }
}

function publicState(room) {
    return {
        roomCode: room.code,

        hostId: room.hostId,

        started: room.started,

        money: Math.floor(
            room.money
        ),

        fuel: Math.floor(
            room.fuel
        ),

        maxFuel: room.maxFuel,

        storeStock:
            room.storeStock,

        maxStoreStock:
            room.maxStoreStock,

        boxes:
            room.boxes,

        cleanliness:
            Math.floor(
                room.cleanliness
            ),

        day:
            room.day,

        time:
            formatTime(room.time),

        players:
            room.players,

        bots:
            room.bots,

        customers:
            room.customers,

        tasks:
            room.tasks,

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
        String(hours).padStart(2, "0") +
        ":" +
        String(mins).padStart(2, "0")
    );
}

function broadcast(room) {
    io.to(
        room.code
    ).emit(
        "gameState",
        publicState(room)
    );
}

function joinRoom(
    socket,
    room,
    name
) {
    const playerCount =
        Object.keys(
            room.players
        ).length;

    socket.join(
        room.code
    );

    if (!room.hostId) {
        room.hostId =
            socket.id;
    }

    room.players[
        socket.id
    ] = {
        id: socket.id,

        name:
            cleanName(name),

        x:
            600 +
            playerCount * 40,

        y: 650,

        color:
            COLORS[
                playerCount
            ],

        carrying: null,

        task: null
    };

    socket.emit(
        "roomJoined",
        {
            roomCode:
                room.code,

            playerId:
                socket.id
        }
    );

    broadcast(room);
}

io.on(
    "connection",
    socket => {

        socket.on(
            "createRoom",
            name => {
                const room =
                    createRoom();

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
                        data.code || ""
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
                        "This room is full."
                    );

                    return;
                }

                if (room.started) {
                    socket.emit(
                        "roomError",
                        "This game has already started."
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
                    getRoom(
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

                room.started = true;

                broadcast(room);
            }
        );

        socket.on(
            "move",
            data => {
                const room =
                    getRoom(
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

                movePlayer(
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
                    getRoom(
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

                startPlayerTask(
                    room,
                    player
                );
            }
        );

        socket.on(
            "cancelTask",
            () => {
                const room =
                    getRoom(
                        socket.id
                    );

                if (!room) {
                    return;
                }

                const player =
                    room.players[
                        socket.id
                    ];

                if (!player) {
                    return;
                }

                player.task = null;
            }
        );

        socket.on(
            "hireBot",
            job => {
                const room =
                    getRoom(
                        socket.id
                    );

                if (
                    !room ||
                    !room.started
                ) {
                    return;
                }

                if (
                    !BOT_JOBS.includes(job)
                ) {
                    return;
                }

                if (
                    room.money < 50
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

                room.money -= 50;

                const id =
                    "bot-" +
                    room.nextBotId++;

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

                    job
                };

                broadcast(room);
            }
        );

        socket.on(
            "upgrade",
            type => {
                const room =
                    getRoom(
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

                if (
                    type === "shelves" &&
                    room.money >= 200
                ) {
                    room.money -= 200;

                    room.upgrades.shelves++;

                    room.maxStoreStock += 20;
                }

                if (
                    type === "employees" &&
                    room.money >= 300 &&
                    room.upgrades.employeeSlots < 6
                ) {
                    room.money -= 300;

                    room.upgrades.employeeSlots++;
                }

                broadcast(room);
            }
        );

        socket.on(
            "disconnect",
            () => {
                const room =
                    getRoom(
                        socket.id
                    );

                if (!room) {
                    return;
                }

                delete room.players[
                    socket.id
                ];

                if (
                    room.hostId ===
                    socket.id
                ) {
                    const remaining =
                        Object.keys(
                            room.players
                        );

                    if (
                        remaining.length
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

                broadcast(room);
            }
        );
    }
);

setInterval(
    () => {
        for (
            const room of
            Object.values(rooms)
        ) {
            updateWorld(room);
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
            broadcast(room);
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
            `Octane running on port ${PORT}`
        );
    }
);
