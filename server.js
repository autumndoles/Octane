
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    transports: ["websocket", "polling"],
    pingInterval: 15000,
    pingTimeout: 5000
});

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

/*
=========================================================
OCTANE - LIGHTWEIGHT MULTIPLAYER SERVER
=========================================================

Designed for:
- Low-power Chromebooks
- Mobile devices
- Small private rooms
- Maximum 4 human players
- Optional employee bots
- Lightweight 2D gameplay

The server is authoritative for:
- Money
- Customers
- Fuel
- Store stock
- Player tasks
- Bots
- Upgrades

The client is responsible for:
- Rendering
- Local movement prediction
- Input
=========================================================
*/


/* =====================================================
   CONFIG
===================================================== */

const MAX_PLAYERS = 4;

const MAX_CUSTOMERS = 5;

const MAX_BOTS = 4;

const SERVER_TICK = 100;

const BROADCAST_TICK = 200;

const STARTING_MONEY = 100;

const PLAYER_SPEED = 3;


/* =====================================================
   WORLD
===================================================== */

const WORLD = {
    width: 1000,
    height: 600
};


/*
Station layout.

The world is intentionally compact.
This keeps rendering and collision checks cheap.
*/

const STATIONS = {

    register: {
        x: 330,
        y: 220,
        radius: 55
    },

    shelves: {
        x: 500,
        y: 220,
        radius: 55
    },

    storage: {
        x: 500,
        y: 430,
        radius: 55
    },

    cleaning: {
        x: 270,
        y: 430,
        radius: 55
    },

    delivery: {
        x: 720,
        y: 500,
        radius: 60
    },

    pumps: [
        {
            x: 700,
            y: 170
        },

        {
            x: 820,
            y: 170
        },

        {
            x: 700,
            y: 300
        },

        {
            x: 820,
            y: 300
        }
    ]

};


/* =====================================================
   ROOM STORAGE
===================================================== */

const rooms = {};


/* =====================================================
   UTILITY
===================================================== */

function randomCode() {

    const characters =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;

    do {

        code = "";

        for (
            let i = 0;
            i < 4;
            i++
        ) {

            code +=
                characters[
                    Math.floor(
                        Math.random() *
                        characters.length
                    )
                ];

        }

    } while (
        rooms[code]
    );

    return code;

}


function distance(
    a,
    b
) {

    const dx =
        a.x -
        b.x;

    const dy =
        a.y -
        b.y;

    return Math.sqrt(
        dx * dx +
        dy * dy
    );

}


function clamp(
    value,
    min,
    max
) {

    return Math.max(
        min,
        Math.min(
            max,
            value
        )
    );

}


function cleanName(
    name
) {

    return String(
        name || "Player"
    )
    .trim()
    .replace(
        /[<>]/g,
        ""
    )
    .slice(
        0,
        20
    ) || "Player";

}


/* =====================================================
   ROOM CREATION
===================================================== */

function createRoom() {

    const code =
        randomCode();

    rooms[code] = {

        code,

        hostId: null,

        started: false,

        money:
            STARTING_MONEY,

        fuel: 50,

        maxFuel: 100,

        stock: 20,

        maxStock: 40,

        deliveryBoxes: 10,

        cleanliness: 100,

        day: 1,

        time: 8 * 60,

        players: {},

        bots: {},

        customers: {},

        tasks: [],

        nextCustomerId: 1,

        nextBotId: 1,

        upgrades: {

            pumps: 2,

            shelves: 1,

            employeeSlots: 2

        }

    };

    return rooms[code];

}


/* =====================================================
   FIND PLAYER ROOM
===================================================== */

function getRoomForPlayer(
    socketId
) {

    for (
        const room of
        Object.values(rooms)
    ) {

        if (
            room.players[
                socketId
            ]
        ) {

            return room;

        }

    }

    return null;

}


/* =====================================================
   PLAYER MOVEMENT
===================================================== */

function movePlayer(
    player,
    input
) {

    let dx = 0;

    let dy = 0;

    if (input.up) {
        dy -= 1;
    }

    if (input.down) {
        dy += 1;
    }

    if (input.left) {
        dx -= 1;
    }

    if (input.right) {
        dx += 1;
    }

    if (
        dx === 0 &&
        dy === 0
    ) {

        return;

    }

    const length =
        Math.sqrt(
            dx * dx +
            dy * dy
        );

    dx /=
        length;

    dy /=
        length;

    player.x +=
        dx *
        PLAYER_SPEED;

    player.y +=
        dy *
        PLAYER_SPEED;

    player.x =
        clamp(
            player.x,
            25,
            WORLD.width - 25
        );

    player.y =
        clamp(
            player.y,
            25,
            WORLD.height - 25
        );

}


/* =====================================================
   CUSTOMER CREATION
===================================================== */

function spawnCustomer(
    room
) {

    if (
        Object.keys(
            room.customers
        ).length >=
        MAX_CUSTOMERS
    ) {

        return;

    }

    const pumpIndex =
        Math.floor(
            Math.random() *
            room.upgrades.pumps
        );

    const pump =
        STATIONS.pumps[
            pumpIndex
        ];

    const id =
        "customer_" +
        room.nextCustomerId++;

    room.customers[id] = {

        id,

        x:
            620,

        y:
            550,

        state:
            "entering",

        pumpIndex,

        fuelProgress:
            0,

        checkoutProgress:
            0,

        patience:
            100,

        wantsStore:
            Math.random() <
            0.65,

        storePurchase:
            5 +
            Math.floor(
                Math.random() *
                10
            )

    };

}


/* =====================================================
   CUSTOMER LOGIC
===================================================== */

function updateCustomers(
    room
) {

    for (
        const customer of
        Object.values(
            room.customers
        )
    ) {

        /*
        Enter station
        */

        if (
            customer.state ===
            "entering"
        ) {

            const pump =
                STATIONS.pumps[
                    customer.pumpIndex
                ];

            if (
                moveTowards(
                    customer,
                    pump.x,
                    pump.y + 45,
                    2
                )
            ) {

                customer.state =
                    "waitingFuel";

            }

        }


        /*
        Waiting for fuel
        */

        else if (
            customer.state ===
            "waitingFuel"
        ) {

            customer.patience -=
                0.05;

        }


        /*
        Fueling
        */

        else if (
            customer.state ===
            "fueling"
        ) {

            customer.fuelProgress +=
                1;

            if (
                customer.fuelProgress >=
                100
            ) {

                const fuelCost =
                    10 +
                    Math.floor(
                        Math.random() *
                        10
                    );

                room.money +=
                    fuelCost;

                if (
                    customer.wantsStore
                ) {

                    customer.state =
                        "shopping";

                } else {

                    customer.state =
                        "leaving";

                }

            }

        }


        /*
        Shopping
        */

        else if (
            customer.state ===
            "shopping"
        ) {

            if (
                room.stock <= 0
            ) {

                customer.state =
                    "leaving";

            } else {

                customer.state =
                    "waitingCheckout";

            }

        }


        /*
        Waiting for cashier
        */

        else if (
            customer.state ===
            "waitingCheckout"
        ) {

            customer.patience -=
                0.04;

        }


        /*
        Checkout
        */

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

                room.stock =
                    Math.max(
                        0,
                        room.stock - 1
                    );

                room.money +=
                    customer.storePurchase;

                customer.state =
                    "leaving";

            }

        }


        /*
        Leaving
        */

        else if (
            customer.state ===
            "leaving"
        ) {

            if (
                moveTowards(
                    customer,
                    620,
                    550,
                    2
                )
            ) {

                delete room.customers[
                    customer.id
                ];

            }

        }


        /*
        Customer patience
        */

        if (
            customer.patience <= 0
        ) {

            customer.state =
                "leaving";

        }

    }


    /*
    Spawn new customers
    */

    if (
        Math.random() <
        0.025
    ) {

        spawnCustomer(
            room
        );

    }

}


/* =====================================================
   MOVEMENT HELPER
===================================================== */

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
        Math.sqrt(
            dx * dx +
            dy * dy
        );

    if (
        length <= speed
    ) {

        entity.x =
            targetX;

        entity.y =
            targetY;

        return true;

    }

    entity.x +=
        dx /
        length *
        speed;

    entity.y +=
        dy /
        length *
        speed;

    return false;

}


/* =====================================================
   PLAYER INTERACTION
===================================================== */

function interact(
    room,
    player
) {

    /*
    Cancel existing task
    */

    if (
        player.task
    ) {

        player.task =
            null;

        return;

    }


    /*
    Fuel pump
    */

    for (
        let i = 0;
        i <
        room.upgrades.pumps;
        i++
    ) {

        const pump =
            STATIONS.pumps[i];

        if (
            distance(
                player,
                pump
            ) <
            60
        ) {

            const customer =
                Object.values(
                    room.customers
                ).find(
                    c =>
                        c.pumpIndex === i &&
                        c.state ===
                        "waitingFuel"
                );

            if (
                customer
            ) {

                customer.state =
                    "fueling";

                player.task = {

                    type:
                        "fuel",

                    customerId:
                        customer.id

                };

                return;

            }

        }

    }


    /*
    Register
    */

    if (
        distance(
            player,
            STATIONS.register
        ) <
        STATIONS.register.radius
    ) {

        const customer =
            Object.values(
                room.customers
            ).find(
                c =>
                    c.state ===
                    "waitingCheckout"
            );

        if (
            customer
        ) {

            customer.state =
                "checkingOut";

            player.task = {

                type:
                    "cashier",

                customerId:
                    customer.id

            };

            return;

        }

    }


    /*
    Pick up box
    */

    if (
        distance(
            player,
            STATIONS.storage
        ) <
        STATIONS.storage.radius &&
        room.deliveryBoxes >
        0 &&
        !player.carrying
    ) {

        player.carrying =
            "box";

        room.deliveryBoxes--;

        return;

    }


    /*
    Restock shelves
    */

    if (
        distance(
            player,
            STATIONS.shelves
        ) <
        STATIONS.shelves.radius &&
        player.carrying ===
        "box"
    ) {

        player.task = {

            type:
                "restock",

            progress:
                0

        };

        return;

    }


    /*
    Cleaning
    */

    if (
        distance(
            player,
            STATIONS.cleaning
        ) <
        STATIONS.cleaning.radius
    ) {

        const task =
            room.tasks.find(
                t =>
                    t.type ===
                    "clean"
            );

        if (
            task
        ) {

            player.task = {

                type:
                    "clean",

                taskId:
                    task.id,

                progress:
                    0

            };

            return;

        }

    }


    /*
    Fuel delivery
    */

    if (
        distance(
            player,
            STATIONS.delivery
        ) <
        STATIONS.delivery.radius &&
        room.fuel <
        room.maxFuel
    ) {

        player.task = {

            type:
                "delivery",

            progress:
                0

        };

    }

}


/* =====================================================
   PLAYER TASKS
===================================================== */

function updatePlayerTasks(
    room
) {

    for (
        const player of
        Object.values(
            room.players
        )
    ) {

        if (
            !player.task
        ) {

            continue;

        }

        const task =
            player.task;


        /*
        Fuel
        */

        if (
            task.type ===
            "fuel"
        ) {

            const customer =
                room.customers[
                    task.customerId
                ];

            if (
                !customer
            ) {

                player.task =
                    null;

                continue;

            }

            if (
                room.fuel <= 0
            ) {

                customer.state =
                    "leaving";

                player.task =
                    null;

                continue;

            }

            room.fuel =
                Math.max(
                    0,
                    room.fuel -
                    0.12
                );

            customer.fuelProgress +=
                2;

            if (
                customer.fuelProgress >=
                100
            ) {

                room.money +=
                    15;

                customer.state =
                    customer.wantsStore
                        ? "shopping"
                        : "leaving";

                player.task =
                    null;

            }

        }


        /*
        Cashier
        */

        else if (
            task.type ===
            "cashier"
        ) {

            const customer =
                room.customers[
                    task.customerId
                ];

            if (
                !customer
            ) {

                player.task =
                    null;

                continue;

            }

            customer.checkoutProgress +=
                4;

            if (
                customer.checkoutProgress >=
                100
            ) {

                room.money +=
                    customer.storePurchase;

                room.stock =
                    Math.max(
                        0,
                        room.stock -
                        1
                    );

                customer.state =
                    "leaving";

                player.task =
                    null;

            }

        }


        /*
        Restocking
        */

        else if (
            task.type ===
            "restock"
        ) {

            task.progress +=
                4;

            if (
                task.progress >=
                100
            ) {

                room.stock =
                    Math.min(
                        room.maxStock,
                        room.stock +
                        10
                    );

                player.carrying =
                    null;

                player.task =
                    null;

            }

        }


        /*
        Cleaning
        */

        else if (
            task.type ===
            "clean"
        ) {

            task.progress +=
                5;

            if (
                task.progress >=
                100
            ) {

                room.cleanliness =
                    Math.min(
                        100,
                        room.cleanliness +
                        20
                    );

                room.tasks =
                    room.tasks.filter(
                        t =>
                            t.id !==
                            task.taskId
                    );

                player.task =
                    null;

            }

        }


        /*
        Fuel delivery
        */

        else if (
            task.type ===
            "delivery"
        ) {

            task.progress +=
                3;

            if (
                task.progress >=
                100
            ) {

                room.fuel =
                    Math.min(
                        room.maxFuel,
                        room.fuel +
                        40
                    );

                player.task =
                    null;

            }

        }

    }

}


/* =====================================================
   BOT AI
===================================================== */

function updateBots(
    room
) {

    for (
        const bot of
        Object.values(
            room.bots
        )
    ) {

        /*
        Fuel bot
        */

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

            if (
                !customer
            ) {

                continue;

            }

            const pump =
                STATIONS.pumps[
                    customer.pumpIndex
                ];

            if (
                moveTowards(
                    bot,
                    pump.x,
                    pump.y + 45,
                    2
                )
            ) {

                customer.state =
                    "fueling";

            }

        }


        /*
        Cashier bot
        */

        else if (
            bot.job ===
            "cashier"
        ) {

            const customer =
                Object.values(
                    room.customers
                ).find(
                    c =>
                        c.state ===
                        "waitingCheckout"
                );

            if (
                !customer
            ) {

                continue;

            }

            if (
                moveTowards(
                    bot,
                    STATIONS.register.x,
                    STATIONS.register.y,
                    2
                )
            ) {

                customer.state =
                    "checkingOut";

            }

        }


        /*
        Restocker bot
        */

        else if (
            bot.job ===
            "restocker"
        ) {

            if (
                room.stock <
                    room.maxStock &&
                room.deliveryBoxes >
                    0
            ) {

                if (
                    moveTowards(
                        bot,
                        STATIONS.shelves.x,
                        STATIONS.shelves.y,
                        2
                    )
                ) {

                    room.stock =
                        Math.min(
                            room.maxStock,
                            room.stock +
                            10
                        );

                    room.deliveryBoxes--;

                }

            }

        }


        /*
        Cleaner bot
        */

        else if (
            bot.job ===
            "cleaner"
        ) {

            const task =
                room.tasks.find(
                    t =>
                        t.type ===
                        "clean"
                );

            if (
                !task
            ) {

                continue;

            }

            if (
                moveTowards(
                    bot,
                    task.x,
                    task.y,
                    2
                )
            ) {

                room.cleanliness =
                    Math.min(
                        100,
                        room.cleanliness +
                        1
                    );

            }

        }

    }

}


/* =====================================================
   WORLD UPDATE
===================================================== */

function updateRoom(
    room
) {

    if (
        !room.started
    ) {

        return;

    }

    updateCustomers(
        room
    );

    updatePlayerTasks(
        room
    );

    updateBots(
        room
    );


    /*
    Game clock
    */

    room.time +=
        0.1;

    if (
        room.time >=
        1440
    ) {

        room.time =
            0;

        room.day++;

        room.deliveryBoxes =
            Math.min(
                20,
                room.deliveryBoxes +
                5
            );

    }


    /*
    Cleanliness slowly decreases
    */

    room.cleanliness =
        Math.max(
            0,
            room.cleanliness -
            0.002
        );


    /*
    Occasionally create a
    cleaning task
    */

    if (
        Math.random() <
        0.001
    ) {

        const exists =
            room.tasks.some(
                t =>
                    t.type ===
                    "clean"
            );

        if (
            !exists
        ) {

            room.tasks.push({

                id:
                    "clean_" +
                    Date.now(),

                type:
                    "clean",

                x:
                    200 +
                    Math.random() *
                    500,

                y:
                    150 +
                    Math.random() *
                    300

            });

        }

    }

}


/* =====================================================
   LIGHTWEIGHT PUBLIC STATE
===================================================== */

function getPublicState(
    room
) {

    return {

        code:
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

        stock:
            room.stock,

        maxStock:
            room.maxStock,

        deliveryBoxes:
            room.deliveryBoxes,

        cleanliness:
            Math.floor(
                room.cleanliness
            ),

        day:
            room.day,

        time:
            Math.floor(
                room.time
            ),

        upgrades:
            room.upgrades,

        players:
            Object.values(
                room.players
            ).map(
                p => ({

                    id:
                        p.id,

                    name:
                        p.name,

                    x:
                        Math.round(
                            p.x
                        ),

                    y:
                        Math.round(
                            p.y
                        ),

                    color:
                        p.color,

                    carrying:
                        p.carrying,

                    task:
                        p.task
                            ? p.task.type
                            : null

                })
            ),

        bots:
            Object.values(
                room.bots
            ).map(
                b => ({

                    id:
                        b.id,

                    name:
                        b.name,

                    x:
                        Math.round(
                            b.x
                        ),

                    y:
                        Math.round(
                            b.y
                        ),

                    job:
                        b.job

                })
            ),

        customers:
            Object.values(
                room.customers
            ).map(
                c => ({

                    id:
                        c.id,

                    x:
                        Math.round(
                            c.x
                        ),

                    y:
                        Math.round(
                            c.y
                        ),

                    state:
                        c.state,

                    pumpIndex:
                        c.pumpIndex,

                    fuelProgress:
                        Math.floor(
                            c.fuelProgress
                        ),

                    checkoutProgress:
                        Math.floor(
                            c.checkoutProgress
                        )

                })
            ),

        tasks:
            room.tasks.map(
                t => ({

                    id:
                        t.id,

                    type:
                        t.type,

                    x:
                        Math.round(
                            t.x
                        ),

                    y:
                        Math.round(
                            t.y
                        )

                })
            )

    };

}


/* =====================================================
   BROADCAST
===================================================== */

function broadcastRoom(
    room
) {

    io.to(
        room.code
    ).emit(
        "state",
        getPublicState(
            room
        )
    );

}


/* =====================================================
   SOCKET.IO
===================================================== */

io.on(
    "connection",
    socket => {


        /*
        Create room
        */

        socket.on(
            "createRoom",
            name => {

                const room =
                    createRoom();

                room.hostId =
                    socket.id;

                socket.join(
                    room.code
                );

                room.players[
                    socket.id
                ] = {

                    id:
                        socket.id,

                    name:
                        cleanName(
                            name
                        ),

                    x:
                        420,

                    y:
                        520,

                    color:
                        "#ff5555",

                    carrying:
                        null,

                    task:
                        null,

                    input: {}

                };

                socket.emit(
                    "joined",
                    {

                        roomCode:
                            room.code,

                        playerId:
                            socket.id

                    }
                );

                broadcastRoom(
                    room
                );

            }
        );


        /*
        Join room
        */

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

                if (
                    !room
                ) {

                    socket.emit(
                        "errorMessage",
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
                        "errorMessage",
                        "Room is full."
                    );

                    return;

                }

                if (
                    room.started
                ) {

                    socket.emit(
                        "errorMessage",
                        "Game already started."
                    );

                    return;

                }

                socket.join(
                    room.code
                );

                const count =
                    Object.keys(
                        room.players
                    ).length;

                room.players[
                    socket.id
                ] = {

                    id:
                        socket.id,

                    name:
                        cleanName(
                            data.name
                        ),

                    x:
                        420 +
                        count *
                        35,

                    y:
                        520,

                    color:
                        [
                            "#ff5555",
                            "#4dabf7",
                            "#51cf66",
                            "#fcc419"
                        ][count],

                    carrying:
                        null,

                    task:
                        null,

                    input: {}

                };

                socket.emit(
                    "joined",
                    {

                        roomCode:
                            room.code,

                        playerId:
                            socket.id

                    }
                );

                broadcastRoom(
                    room
                );

            }
        );


        /*
        Start game
        */

        socket.on(
            "startGame",
            () => {

                const room =
                    getRoomForPlayer(
                        socket.id
                    );

                if (
                    !room
                ) {

                    return;

                }

                if (
                    room.hostId !==
                    socket.id
                ) {

                    return;

                }

                room.started =
                    true;

                broadcastRoom(
                    room
                );

            }
        );


        /*
        Movement input
        */

        socket.on(
            "input",
            input => {

                const room =
                    getRoomForPlayer(
                        socket.id
                    );

                if (
                    !room
                ) {

                    return;

                }

                const player =
                    room.players[
                        socket.id
                    ];

                if (
                    !player
                ) {

                    return;

                }

                player.input = {

                    up:
                        !!input.up,

                    down:
                        !!input.down,

                    left:
                        !!input.left,

                    right:
                        !!input.right

                };

            }
        );


        /*
        Interact
        */

        socket.on(
            "interact",
            () => {

                const room =
                    getRoomForPlayer(
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

                if (
                    !player
                ) {

                    return;

                }

                interact(
                    room,
                    player
                );

            }
        );


        /*
        Hire bot
        */

        socket.on(
            "hireBot",
            job => {

                const room =
                    getRoomForPlayer(
                        socket.id
                    );

                if (
                    !room ||
                    !room.started
                ) {

                    return;

                }

                if (
                    room.money <
                    50
                ) {

                    return;

                }

                if (
                    Object.keys(
                        room.bots
                    ).length >=
                    Math.min(
                        MAX_BOTS,
                        room.upgrades
                            .employeeSlots
                    )
                ) {

                    return;

                }

                const validJobs = [

                    "fuel",

                    "cashier",

                    "restocker",

                    "cleaner"

                ];

                if (
                    !validJobs.includes(
                        job
                    )
                ) {

                    return;

                }

                room.money -=
                    50;

                const id =
                    "bot_" +
                    room.nextBotId++;

                room.bots[id] = {

                    id,

                    name:
                        "Employee " +
                        room.nextBotId,

                    x:
                        600,

                    y:
                        500,

                    job

                };

                broadcastRoom(
                    room
                );

            }
        );


        /*
        Upgrade station
        */

        socket.on(
            "upgrade",
            type => {

                const room =
                    getRoomForPlayer(
                        socket.id
                    );

                if (
                    !room ||
                    !room.started
                ) {

                    return;

                }


                if (
                    type ===
                    "pump" &&
                    room.money >=
                    250 &&
                    room.upgrades.pumps <
                    STATIONS.pumps.length
                ) {

                    room.money -=
                        250;

                    room.upgrades.pumps++;

                }


                else if (
                    type ===
                    "shelves" &&
                    room.money >=
                    200
                ) {

                    room.money -=
                        200;

                    room.upgrades.shelves++;

                    room.maxStock +=
                        20;

                }


                else if (
                    type ===
                    "employees" &&
                    room.money >=
                    300 &&
                    room.upgrades
                        .employeeSlots <
                    MAX_BOTS
                ) {

                    room.money -=
                        300;

                    room.upgrades
                        .employeeSlots++;

                }

                broadcastRoom(
                    room
                );

            }
        );


        /*
        Disconnect
        */

        socket.on(
            "disconnect",
            () => {

                const room =
                    getRoomForPlayer(
                        socket.id
                    );

                if (
                    !room
                ) {

                    return;

                }

                delete room.players[
                    socket.id
                ];


                /*
                Give host role
                to another player
                */

                if (
                    room.hostId ===
                    socket.id
                ) {

                    const players =
                        Object.keys(
                            room.players
                        );

                    if (
                        players.length >
                        0
                    ) {

                        room.hostId =
                            players[0];

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


/* =====================================================
   SERVER LOOP
===================================================== */

setInterval(
    () => {

        for (
            const room of
            Object.values(
                rooms
            )
        ) {

            /*
            Process player movement
            */

            if (
                room.started
            ) {

                for (
                    const player of
                    Object.values(
                        room.players
                    )
                ) {

                    movePlayer(
                        player,
                        player.input
                    );

                }

            }


            /*
            Update gameplay
            */

            updateRoom(
                room
            );

        }

    },
    SERVER_TICK
);


/* =====================================================
   STATE BROADCAST LOOP
===================================================== */

setInterval(
    () => {

        for (
            const room of
            Object.values(
                rooms
            )
        ) {

            broadcastRoom(
                room
            );

        }

    },
    BROADCAST_TICK
);


/* =====================================================
   ROUTES
===================================================== */

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


/* =====================================================
   START SERVER
===================================================== */

server.listen(
    PORT,
    () => {

        console.log(
            `Octane server running on port ${PORT}`
        );

    }
);
