
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    transports: ["websocket"],
    pingInterval: 20000,
    pingTimeout: 5000,
    maxHttpBufferSize: 100000
});

const PORT = process.env.PORT || 3000;


/* =====================================================
   OCTANE 2.0
   Lightweight cooperative gas station simulator
===================================================== */


/* =====================================================
   PERFORMANCE SETTINGS
===================================================== */

const SIMULATION_HZ = 10;
const NETWORK_HZ = 5;

const SIMULATION_MS =
    1000 / SIMULATION_HZ;

const NETWORK_MS =
    1000 / NETWORK_HZ;


/* =====================================================
   GAME SETTINGS
===================================================== */

const WORLD = {
    width: 480,
    height: 270
};

const MAX_PLAYERS = 4;
const MAX_BOTS = 4;

const STARTING_MONEY = 100;

const PLAYER_SPEED = 3;
const BOT_SPEED = 2.2;

const BOT_THINK_TIME = 750;

const TASK_TIMEOUT = 5000;

const MAX_CUSTOMERS = 8;


/* =====================================================
   STATION
===================================================== */

const STATION = {

    register: {
        x: 150,
        y: 120
    },

    shelves: {
        x: 230,
        y: 120
    },

    storage: {
        x: 230,
        y: 225
    },

    cleaning: {
        x: 105,
        y: 220
    },

    delivery: {
        x: 380,
        y: 235
    },

    restroom: {
        x: 70,
        y: 120
    },

    pumps: [

        {
            x: 350,
            y: 70
        },

        {
            x: 420,
            y: 70
        },

        {
            x: 350,
            y: 145
        },

        {
            x: 420,
            y: 145
        }

    ]

};


/* =====================================================
   ROOMS
===================================================== */

const rooms = Object.create(null);


/* =====================================================
   ID HELPERS
===================================================== */

let nextRoomId = 1;


/* =====================================================
   BASIC UTILITIES
===================================================== */

function randomCode() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let result = "";

    for (
        let i = 0;
        i < 4;
        i++
    ) {

        result +=
            chars[
                Math.floor(
                    Math.random() *
                    chars.length
                )
            ];

    }

    return result;

}


function createRoom() {

    let code;

    do {

        code =
            randomCode();

    } while (
        rooms[code]
    );


    const room = {

        id:
            nextRoomId++,

        code,

        hostId:
            null,

        started:
            false,

        money:
            STARTING_MONEY,

        fuel:
            50,

        maxFuel:
            100,

        stock:
            20,

        maxStock:
            40,

        deliveryBoxes:
            5,

        cleanliness:
            100,

        day:
            1,

        time:
            8 * 60,


        players:
            Object.create(null),

        bots:
            Object.create(null),

        customers:
            Object.create(null),

        tasks:
            Object.create(null),


        nextBotId:
            1,

        nextCustomerId:
            1,

        nextTaskId:
            1,


        upgrades: {

            pumps:
                2,

            employeeSlots:
                1,

            shelfCapacity:
                1

        }

    };


    rooms[code] =
        room;


    return room;

}


function getRoomBySocket(
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


function cleanName(
    name
) {

    return String(
        name || "Player"
    )
    .replace(
        /[<>]/g,
        ""
    )
    .trim()
    .slice(
        0,
        20
    ) || "Player";

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


function moveTowards(
    worker,
    target,
    speed
) {

    const dx =
        target.x -
        worker.x;

    const dy =
        target.y -
        worker.y;

    const dist =
        Math.sqrt(
            dx * dx +
            dy * dy
        );


    if (
        dist <= speed
    ) {

        worker.x =
            target.x;

        worker.y =
            target.y;

        return true;

    }


    worker.x +=
        dx /
        dist *
        speed;

    worker.y +=
        dy /
        dist *
        speed;


    return false;

}


/* =====================================================
   WORKER SYSTEM
===================================================== */

/*
Every worker has:

position
task
carrying
last movement
task start time

Players and bots use the same
underlying task system.
*/


function createWorker(
    id,
    name,
    x,
    y,
    type,
    color
) {

    return {

        id,

        name,

        type,

        x,

        y,

        color,

        carrying:
            null,

        task:
            null,

        lastX:
            x,

        lastY:
            y,

        lastMovedAt:
            Date.now(),

        lastThinkAt:
            0,

        input: {

            up:
                false,

            down:
                false,

            left:
                false,

            right:
                false

        }

    };

}


/* =====================================================
   PLAYER MOVEMENT
===================================================== */

function updatePlayerMovement(
    player
) {

    let dx = 0;
    let dy = 0;


    if (
        player.input.up
    ) {

        dy--;

    }

    if (
        player.input.down
    ) {

        dy++;

    }

    if (
        player.input.left
    ) {

        dx--;

    }

    if (
        player.input.right
    ) {

        dx++;

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


    player.x +=
        dx /
        length *
        PLAYER_SPEED;

    player.y +=
        dy /
        length *
        PLAYER_SPEED;


    player.x =
        clamp(
            player.x,
            10,
            WORLD.width -
            10
        );


    player.y =
        clamp(
            player.y,
            10,
            WORLD.height -
            10
        );


    updateWorkerMovement(
        player
    );

}


/* =====================================================
   MOVEMENT TRACKING
===================================================== */

function updateWorkerMovement(
    worker
) {

    const moved =
        Math.abs(
            worker.x -
            worker.lastX
        ) > 0.1 ||
        Math.abs(
            worker.y -
            worker.lastY
        ) > 0.1;


    if (
        moved
    ) {

        worker.lastX =
            worker.x;

        worker.lastY =
            worker.y;

        worker.lastMovedAt =
            Date.now();

    }

}


/* =====================================================
   TASK CREATION
===================================================== */

function createTask(
    room,
    type,
    target,
    priority
) {

    const id =
        "task_" +
        room.nextTaskId++;


    room.tasks[id] = {

        id,

        type,

        x:
            target.x,

        y:
            target.y,

        priority,

        claimedBy:
            null,

        claimedAt:
            0

    };


    return room.tasks[id];

}


/* =====================================================
   TASK RELEASE
===================================================== */

function releaseTask(
    room,
    task
) {

    if (
        !task
    ) {

        return;

    }


    task.claimedBy =
        null;

    task.claimedAt =
        0;

}


/* =====================================================
   RELEASE WORKER
===================================================== */

function releaseWorkerTask(
    room,
    worker
) {

    if (
        !worker.task
    ) {

        return;

    }


    const task =
        worker.task;


    if (
        task.type ===
        "fuel" ||
        task.type ===
        "cashier"
    ) {

        const customer =
            room.customers[
                task.customerId
            ];


        if (
            customer &&
            customer.claimedBy ===
            worker.id
        ) {

            customer.claimedBy =
                null;


            if (
                customer.state ===
                "fueling"
            ) {

                customer.state =
                    "waitingFuel";

            }


            if (
                customer.state ===
                "checkingOut"
            ) {

                customer.state =
                    "waitingCheckout";

            }

        }

    }


    if (
        task.taskId
    ) {

        const stationTask =
            room.tasks[
                task.taskId
            ];


        if (
            stationTask &&
            stationTask.claimedBy ===
            worker.id
        ) {

            releaseTask(
                room,
                stationTask
            );

        }

    }


    worker.task =
        null;

}


/* =====================================================
   CUSTOMER SYSTEM
===================================================== */

const CUSTOMER_TYPES = [

    "fuel",

    "shop",

    "fuelShop",

    "restroom"

];


function createCustomer(
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


    const type =
        CUSTOMER_TYPES[
            Math.floor(
                Math.random() *
                CUSTOMER_TYPES.length
            )
        ];


    const pumpIndex =
        Math.floor(
            Math.random() *
            room.upgrades.pumps
        );


    const id =
        "customer_" +
        room.nextCustomerId++;


    room.customers[id] = {

        id,

        type,

        x:
            455,

        y:
            255,

        state:
            "entering",

        pumpIndex,

        patience:
            100,

        fuelProgress:
            0,

        shopProgress:
            0,

        restroomProgress:
            0,

        claimedBy:
            null,

        targetX:
            0,

        targetY:
            0

    };

}


/* =====================================================
   CUSTOMER UPDATE
===================================================== */

function updateCustomers(
    room
) {

    const now =
        Date.now();


    for (
        const customer of
        Object.values(
            room.customers
        )
    ) {


        /* ---------------------------------------------
           ENTERING
        --------------------------------------------- */

        if (
            customer.state ===
            "entering"
        ) {

            customer.targetX =
                430;

            customer.targetY =
                240;


            const arrived =
                moveTowards(
                    customer,
                    customer,
                    0
                );


            customer.x +=
                (430 -
                    customer.x) *
                0.05;


            customer.y +=
                (240 -
                    customer.y) *
                0.05;


            if (
                distance(
                    customer,
                    {
                        x:
                            430,

                        y:
                            240
                    }
                ) <
                5
            ) {

                if (
                    customer.type ===
                    "fuel" ||
                    customer.type ===
                    "fuelShop"
                ) {

                    customer.state =
                        "waitingFuel";

                }

                else if (
                    customer.type ===
                    "shop"
                ) {

                    customer.state =
                        "waitingCheckout";

                }

                else {

                    customer.state =
                        "waitingRestroom";

                }

            }

        }


        /* ---------------------------------------------
           WAITING STATES
        --------------------------------------------- */

        else if (
            customer.state ===
            "waitingFuel" ||
            customer.state ===
            "waitingCheckout" ||
            customer.state ===
            "waitingRestroom"
        ) {

            customer.patience -=
                0.05;

        }


        /* ---------------------------------------------
           FUELING
        --------------------------------------------- */

        else if (
            customer.state ===
            "fueling"
        ) {

            customer.fuelProgress +=
                2;


            if (
                customer.fuelProgress >=
                100
            ) {

                room.money +=
                    15;


                customer.claimedBy =
                    null;


                if (
                    customer.type ===
                    "fuelShop"
                ) {

                    customer.state =
                        "waitingCheckout";

                }

                else {

                    customer.state =
                        "leaving";

                }

            }

        }


        /* ---------------------------------------------
           SHOPPING
        --------------------------------------------- */

        else if (
            customer.state ===
            "shopping"
        ) {

            customer.shopProgress +=
                3;


            if (
                customer.shopProgress >=
                100
            ) {

                room.money +=
                    10;


                room.stock =
                    Math.max(
                        0,
                        room.stock -
                        1
                    );


                customer.claimedBy =
                    null;

                customer.state =
                    "leaving";

            }

        }


        /* ---------------------------------------------
           RESTROOM
        --------------------------------------------- */

        else if (
            customer.state ===
            "usingRestroom"
        ) {

            customer.restroomProgress +=
                3;


            if (
                customer.restroomProgress >=
                100
            ) {

                customer.claimedBy =
                    null;


                createCleaningTask(
                    room,
                    100,
                    120
                );


                customer.state =
                    "leaving";

            }

        }


        /* ---------------------------------------------
           LEAVING
        --------------------------------------------- */

        else if (
            customer.state ===
            "leaving"
        ) {

            customer.x +=
                1.5;


            if (
                customer.x >
                WORLD.width +
                20
            ) {

                delete room.customers[
                    customer.id
                ];

            }

        }


        /* ---------------------------------------------
           PATIENCE
        --------------------------------------------- */

        if (
            customer.patience <=
            0
        ) {

            customer.claimedBy =
                null;

            customer.state =
                "leaving";

        }

    }


    /*
    Spawn customers occasionally.
    */

    if (
        Math.random() <
        0.035
    ) {

        createCustomer(
            room
        );

    }

}


/* =====================================================
   CLEANING TASKS
===================================================== */

function createCleaningTask(
    room,
    x,
    y
) {

    for (
        const task of
        Object.values(
            room.tasks
        )
    ) {

        if (
            task.type ===
            "clean" &&
            distance(
                task,
                {
                    x,
                    y
                }
            ) <
            20
        ) {

            return;

        }

    }


    createTask(
        room,
        "clean",
        {
            x,
            y
        },
        2
    );

}


/* =====================================================
   FIND TASKS
===================================================== */

function findAvailableTask(
    room,
    type
) {

    let best =
        null;


    for (
        const task of
        Object.values(
            room.tasks
        )
    ) {

        if (
            task.type !==
            type
        ) {

            continue;

        }


        if (
            task.claimedBy
        ) {

            continue;

        }


        if (
            !best ||
            task.priority >
            best.priority
        ) {

            best =
                task;

        }

    }


    return best;

}


/* =====================================================
   PLAYER INTERACTION
===================================================== */

function playerInteract(
    room,
    player
) {

    /*
    Cancel current task.
    */

    if (
        player.task
    ) {

        releaseWorkerTask(
            room,
            player
        );

        return;

    }


    /*
    Fuel pump.
    */

    for (
        let i = 0;
        i <
        room.upgrades.pumps;
        i++
    ) {

        const pump =
            STATION.pumps[i];


        if (
            distance(
                player,
                pump
            ) <
            30
        ) {

            const customer =
                Object.values(
                    room.customers
                ).find(
                    c =>
                        c.state ===
                        "waitingFuel" &&

                        c.pumpIndex ===
                        i &&

                        !c.claimedBy
                );


            if (
                customer
            ) {

                customer.claimedBy =
                    player.id;

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
    Register.
    */

    if (
        distance(
            player,
            STATION.register
        ) <
        35
    ) {

        const customer =
            Object.values(
                room.customers
            ).find(
                c =>
                    c.state ===
                    "waitingCheckout" &&

                    !c.claimedBy
            );


        if (
            customer
        ) {

            customer.claimedBy =
                player.id;

            customer.state =
                "shopping";


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
    Restock.
    */

    if (
        distance(
            player,
            STATION.storage
        ) <
        35 &&
        room.deliveryBoxes >
        0 &&
        !player.carrying
    ) {

        room.deliveryBoxes--;

        player.carrying =
            "box";

        return;

    }


    if (
        distance(
            player,
            STATION.shelves
        ) <
        35 &&
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
    Cleaning.
    */

    const cleanTask =
        findAvailableTask(
            room,
            "clean"
        );


    if (
        cleanTask &&
        distance(
            player,
            cleanTask
        ) <
        35
    ) {

        cleanTask.claimedBy =
            player.id;

        cleanTask.claimedAt =
            Date.now();


        player.task = {

            type:
                "clean",

            taskId:
                cleanTask.id,

            progress:
                0

        };


        return;

    }


    /*
    Fuel delivery.
    */

    if (
        distance(
            player,
            STATION.delivery
        ) <
        35 &&
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
   WORKER TASK UPDATE
===================================================== */

function updateWorkerTask(
    room,
    worker
) {

    if (
        !worker.task
    ) {

        return;

    }


    const task =
        worker.task;


    /* ---------------------------------------------
       FUEL
    --------------------------------------------- */

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

            worker.task =
                null;

            return;

        }


        if (
            room.fuel <=
            0
        ) {

            releaseWorkerTask(
                room,
                worker
            );

            return;

        }


        room.fuel -=
            0.15;


        customer.fuelProgress +=
            2;


        if (
            customer.fuelProgress >=
            100
        ) {

            room.money +=
                15;


            customer.claimedBy =
                null;


            if (
                customer.type ===
                "fuelShop"
            ) {

                customer.state =
                    "waitingCheckout";

            }

            else {

                customer.state =
                    "leaving";

            }


            worker.task =
                null;

        }


        return;

    }


    /* ---------------------------------------------
       CASHIER
    --------------------------------------------- */

    if (
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

            worker.task =
                null;

            return;

        }


        customer.shopProgress +=
            4;


        if (
            customer.shopProgress >=
            100
        ) {

            room.money +=
                10;


            room.stock =
                Math.max(
                    0,
                    room.stock -
                    1
                );


            customer.claimedBy =
                null;

            customer.state =
                "leaving";


            worker.task =
                null;

        }


        return;

    }


    /* ---------------------------------------------
       RESTOCK
    --------------------------------------------- */

    if (
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


            worker.carrying =
                null;


            worker.task =
                null;

        }


        return;

    }


    /* ---------------------------------------------
       CLEAN
    --------------------------------------------- */

    if (
        task.type ===
        "clean"
    ) {

        const stationTask =
            room.tasks[
                task.taskId
            ];


        if (
            !stationTask
        ) {

            worker.task =
                null;

            return;

        }


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


            delete room.tasks[
                task.taskId
            ];


            worker.task =
                null;

        }


        return;

    }


    /* ---------------------------------------------
       DELIVERY
    --------------------------------------------- */

    if (
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


            worker.task =
                null;

        }

    }

}


/* =====================================================
   BOT AI
===================================================== */

function botThink(
    room,
    bot
) {

    const now =
        Date.now();


    if (
        now -
        bot.lastThinkAt <
        BOT_THINK_TIME
    ) {

        return;

    }


    bot.lastThinkAt =
        now;


    if (
        bot.task
    ) {

        return;

    }


    /*
    Fuel customers first.
    */

    const fuelCustomer =
        Object.values(
            room.customers
        ).find(
            c =>
                c.state ===
                "waitingFuel" &&

                !c.claimedBy
        );


    if (
        fuelCustomer &&
        room.fuel >
        0
    ) {

        fuelCustomer.claimedBy =
            bot.id;


        bot.task = {

            type:
                "fuel",

            customerId:
                fuelCustomer.id

        };


        return;

    }


    /*
    Checkout.
    */

    const checkout =
        Object.values(
            room.customers
        ).find(
            c =>
                c.state ===
                "waitingCheckout" &&

                !c.claimedBy
        );


    if (
        checkout
    ) {

        checkout.claimedBy =
            bot.id;

        checkout.state =
            "shopping";


        bot.task = {

            type:
                "cashier",

            customerId:
                checkout.id

        };


        return;

    }


    /*
    Restock.
    */

    if (
        room.stock <=
        8 &&
        room.deliveryBoxes >
        0
    ) {

        bot.task = {

            type:
                "restockPickup"

        };


        return;

    }


    /*
    Cleaning.
    */

    const cleanTask =
        findAvailableTask(
            room,
            "clean"
        );


    if (
        cleanTask
    ) {

        cleanTask.claimedBy =
            bot.id;

        cleanTask.claimedAt =
            now;


        bot.task = {

            type:
                "clean",

            taskId:
                cleanTask.id,

            progress:
                0

        };


        return;

    }


    /*
    Fuel delivery.
    */

    if (
        room.fuel <
        25
    ) {

        bot.task = {

            type:
                "delivery",

            progress:
                0

        };

    }

}


/* =====================================================
   BOT UPDATE
===================================================== */

function updateBot(
    room,
    bot
) {

    const now =
        Date.now();


    /*
    Stuck detection.

    If the bot has a task but
    hasn't moved for 5 seconds,
    release the task.
    */

    if (
        bot.task &&
        now -
        bot.lastMovedAt >
        TASK_TIMEOUT
    ) {

        releaseWorkerTask(
            room,
            bot
        );

    }


    botThink(
        room,
        bot
    );


    if (
        !bot.task
    ) {

        return;

    }


    const task =
        bot.task;


    /* ---------------------------------------------
       FUEL
    --------------------------------------------- */

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

            bot.task =
                null;

            return;

        }


        const pump =
            STATION.pumps[
                customer.pumpIndex
            ];


        if (
            moveTowards(
                bot,
                pump,
                BOT_SPEED
            )
        ) {

            updateWorkerTask(
                room,
                bot
            );

        }


        updateWorkerMovement(
            bot
        );


        return;

    }


    /* ---------------------------------------------
       CASHIER
    --------------------------------------------- */

    if (
        task.type ===
        "cashier"
    ) {

        if (
            moveTowards(
                bot,
                STATION.register,
                BOT_SPEED
            )
        ) {

            updateWorkerTask(
                room,
                bot
            );

        }


        updateWorkerMovement(
            bot
        );


        return;

    }


    /* ---------------------------------------------
       RESTOCK PICKUP
    --------------------------------------------- */

    if (
        task.type ===
        "restockPickup"
    ) {

        if (
            moveTowards(
                bot,
                STATION.storage,
                BOT_SPEED
            )
        ) {

            if (
                room.deliveryBoxes >
                0
            ) {

                room.deliveryBoxes--;

                bot.carrying =
                    "box";


                bot.task = {

                    type:
                        "restock",

                    progress:
                        0

                };

            }

            else {

                bot.task =
                    null;

            }

        }


        updateWorkerMovement(
            bot
        );


        return;

    }


    /* ---------------------------------------------
       RESTOCK
    --------------------------------------------- */

    if (
        task.type ===
        "restock"
    ) {

        if (
            moveTowards(
                bot,
                STATION.shelves,
                BOT_SPEED
            )
        ) {

            updateWorkerTask(
                room,
                bot
            );

        }


        updateWorkerMovement(
            bot
        );


        return;

    }


    /* ---------------------------------------------
       CLEAN
    --------------------------------------------- */

    if (
        task.type ===
        "clean"
    ) {

        const cleanTask =
            room.tasks[
                task.taskId
            ];


        if (
            !cleanTask
        ) {

            bot.task =
                null;

            return;

        }


        if (
            moveTowards(
                bot,
                cleanTask,
                BOT_SPEED
            )
        ) {

            updateWorkerTask(
                room,
                bot
            );

        }


        updateWorkerMovement(
            bot
        );


        return;

    }


    /* ---------------------------------------------
       DELIVERY
    --------------------------------------------- */

    if (
        task.type ===
        "delivery"
    ) {

        if (
            moveTowards(
                bot,
                STATION.delivery,
                BOT_SPEED
            )
        ) {

            updateWorkerTask(
                room,
                bot
            );

        }


        updateWorkerMovement(
            bot
        );

    }

}


/* =====================================================
   BOT PRIORITY FIX
===================================================== */

/*
If a player is actively working
on a customer, bots don't steal it.

If a player starts a cleaning task,
the bot task is released.
*/


function preventBotConflicts(
    room
) {

    for (
        const bot of
        Object.values(
            room.bots
        )
    ) {

        if (
            !bot.task
        ) {

            continue;

        }


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


            if (
                player.task.customerId &&
                bot.task.customerId ===
                player.task.customerId
            ) {

                releaseWorkerTask(
                    room,
                    bot
                );

            }


            if (
                player.task.taskId &&
                bot.task.taskId ===
                player.task.taskId
            ) {

                releaseWorkerTask(
                    room,
                    bot
                );

            }

        }

    }

}


/* =====================================================
   GAME SIMULATION
===================================================== */

function updateRoom(
    room
) {

    if (
        !room.started
    ) {

        return;

    }


    /*
    Players.
    */

    for (
        const player of
        Object.values(
            room.players
        )
    ) {

        updatePlayerMovement(
            player
        );

        updateWorkerTask(
            room,
            player
        );

    }


    /*
    Customers.
    */

    updateCustomers(
        room
    );


    /*
    Bots.
    */

    for (
        const bot of
        Object.values(
            room.bots
        )
    ) {

        updateBot(
            room,
            bot
        );

    }


    /*
    Prevent bots from
    interfering with players.
    */

    preventBotConflicts(
        room
    );


    /*
    Clock.

    Very lightweight simulation.
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

    }


    /*
    Cleanliness.
    */

    room.cleanliness =
        Math.max(
            0,
            room.cleanliness -
            0.002
        );


    /*
    Automatic cleanup
    of abandoned task claims.
    */

    const now =
        Date.now();


    for (
        const task of
        Object.values(
            room.tasks
        )
    ) {

        if (
            task.claimedBy &&
            now -
            task.claimedAt >
            TASK_TIMEOUT
        ) {

            releaseTask(
                room,
                task
            );

        }

    }

}


/* =====================================================
   NETWORK STATE
===================================================== */

function buildState(
    room
) {

    return {

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

                    carrying:
                        b.carrying,

                    task:
                        b.task
                            ? b.task.type
                            : null

                })
            ),


        customers:
            Object.values(
                room.customers
            ).map(
                c => ({

                    id:
                        c.id,

                    type:
                        c.type,

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

                    shopProgress:
                        Math.floor(
                            c.shopProgress
                        )

                })
            ),


        tasks:
            Object.values(
                room.tasks
            ).map(
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
            ),


        upgrades:
            room.upgrades

    };

}


/* =====================================================
   NETWORK BROADCAST
===================================================== */

function broadcastRoom(
    room
) {

    io.to(
        room.code
    ).emit(
        "state",
        buildState(
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


        /* ---------------------------------------------
           CREATE ROOM
        --------------------------------------------- */

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
                ] =
                    createWorker(

                        socket.id,

                        cleanName(
                            name
                        ),

                        160,

                        245,

                        "player",

                        "#ff5555"

                    );


                socket.emit(
                    "joined",
                    {

                        roomCode:
                            room.code,

                        playerId:
                            socket.id,

                        isHost:
                            true

                    }
                );


                broadcastRoom(
                    room
                );

            }
        );


        /* ---------------------------------------------
           JOIN ROOM
        --------------------------------------------- */

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
                        "Station not found."
                    );

                    return;

                }


                if (
                    room.started
                ) {

                    socket.emit(
                        "errorMessage",
                        "The shift has already started."
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
                        "This station is full."
                    );

                    return;

                }


                const count =
                    Object.keys(
                        room.players
                    ).length;


                socket.join(
                    room.code
                );


                room.players[
                    socket.id
                ] =
                    createWorker(

                        socket.id,

                        cleanName(
                            data.name
                        ),

                        160 +
                        count *
                        25,

                        245,

                        "player",

                        [
                            "#ff5555",
                            "#4dabf7",
                            "#51cf66",
                            "#fcc419"
                        ][
                            count
                        ]

                    );


                socket.emit(
                    "joined",
                    {

                        roomCode:
                            room.code,

                        playerId:
                            socket.id,

                        isHost:
                            false

                    }
                );


                broadcastRoom(
                    room
                );

            }
        );


        /* ---------------------------------------------
           START
        --------------------------------------------- */

        socket.on(
            "startGame",
            () => {

                const room =
                    getRoomBySocket(
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


        /* ---------------------------------------------
           PLAYER INPUT
        --------------------------------------------- */

        socket.on(
            "input",
            input => {

                const room =
                    getRoomBySocket(
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


                player.input.up =
                    !!input.up;

                player.input.down =
                    !!input.down;

                player.input.left =
                    !!input.left;

                player.input.right =
                    !!input.right;

            }
        );


        /* ---------------------------------------------
           INTERACT
        --------------------------------------------- */

        socket.on(
            "interact",
            () => {

                const room =
                    getRoomBySocket(
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
                    player
                ) {

                    playerInteract(
                        room,
                        player
                    );

                }

            }
        );


        /* ---------------------------------------------
           HIRE GENERAL EMPLOYEE
        --------------------------------------------- */

        socket.on(
            "hireBot",
            () => {

                const room =
                    getRoomBySocket(
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


                room.money -=
                    50;


                const id =
                    "bot_" +
                    room.nextBotId++;


                room.bots[id] =
                    createWorker(

                        id,

                        "Employee " +
                        room.nextBotId,

                        300,

                        240,

                        "bot",

                        "#9b5de5"

                    );


                broadcastRoom(
                    room
                );

            }
        );


        /* ---------------------------------------------
           UPGRADES
        --------------------------------------------- */

        socket.on(
            "upgrade",
            type => {

                const room =
                    getRoomBySocket(
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
                    4
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

                    room.upgrades
                        .shelfCapacity++;

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


        /* ---------------------------------------------
           DISCONNECT
        --------------------------------------------- */

        socket.on(
            "disconnect",
            () => {

                const room =
                    getRoomBySocket(
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
                    player
                ) {

                    releaseWorkerTask(
                        room,
                        player
                    );

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

                    }

                    else {

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
   SIMULATION LOOP
===================================================== */

setInterval(
    () => {

        for (
            const room of
            Object.values(rooms)
        ) {

            updateRoom(
                room
            );

        }

    },
    SIMULATION_MS
);


/* =====================================================
   NETWORK LOOP
===================================================== */

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
    NETWORK_MS
);


/* =====================================================
   EXPRESS
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
   SERVER
===================================================== */

server.listen(
    PORT,
    () => {

        console.log(
            `Octane 2.0 running on port ${PORT}`
        );

    }
);
