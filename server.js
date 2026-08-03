
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


/* =====================================================
   OCTANE
   Multiplayer Gas Station Co-op
   General-purpose workers
===================================================== */


/* =====================================================
   CONFIG
===================================================== */

const WORLD = {
    width: 960,
    height: 540
};

const MAX_PLAYERS = 4;
const MAX_BOTS = 4;

const STARTING_MONEY = 100;

const SERVER_TICK = 100;
const BROADCAST_TICK = 200;

const PLAYER_SPEED = 3;
const BOT_SPEED = 2;

const MAX_CUSTOMERS = 5;


/* =====================================================
   STATION
===================================================== */

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
   ROOMS
===================================================== */

const rooms = {};


/* =====================================================
   UTILITY FUNCTIONS
===================================================== */

function randomRoomCode() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;

    do {

        code = "";

        for (
            let i = 0;
            i < 4;
            i++
        ) {

            code += chars[
                Math.floor(
                    Math.random() *
                    chars.length
                )
            ];

        }

    } while (
        rooms[code]
    );

    return code;

}


function createRoom() {

    const code =
        randomRoomCode();

    rooms[code] = {

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
            10,

        cleanliness:
            100,

        day:
            1,

        time:
            8 * 60,

        players:
            {},

        bots:
            {},

        customers:
            {},

        tasks:
            [],

        nextCustomerId:
            1,

        nextBotId:
            1,

        nextTaskId:
            1,

        upgrades: {

            pumps:
                2,

            shelves:
                1,

            employeeSlots:
                2

        }

    };

    return rooms[code];

}


function getPlayerRoom(
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

    const dist =
        Math.sqrt(
            dx * dx +
            dy * dy
        );

    if (
        dist <= speed
    ) {

        entity.x =
            targetX;

        entity.y =
            targetY;

        return true;

    }

    entity.x +=
        dx /
        dist *
        speed;

    entity.y +=
        dy /
        dist *
        speed;

    return false;

}


/* =====================================================
   PLAYER MOVEMENT
===================================================== */

function movePlayer(
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
            20,
            WORLD.width -
            20
        );

    player.y =
        clamp(
            player.y,
            20,
            WORLD.height -
            20
        );

}


/* =====================================================
   CUSTOMER SYSTEM
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


    const customer = {

        id:
            "customer_" +
            room.nextCustomerId++,

        x:
            620,

        y:
            500,

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
            ),

        claimedBy:
            null,

        paidFuel:
            false,

        paidStore:
            false

    };


    room.customers[
        customer.id
    ] =
        customer;

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


        else if (
            customer.state ===
            "waitingFuel"
        ) {

            customer.patience -=
                0.04;

        }


        else if (
            customer.state ===
            "waitingCheckout"
        ) {

            customer.patience -=
                0.04;

        }


        /*
        Customers being actively
        worked on do not lose
        patience as quickly.
        */

        else if (
            customer.state ===
            "fueling" ||
            customer.state ===
            "checkingOut"
        ) {

            customer.patience -=
                0.005;

        }


        /*
        Leaving customer
        */

        else if (
            customer.state ===
            "leaving"
        ) {

            if (
                moveTowards(
                    customer,
                    620,
                    500,
                    2
                )
            ) {

                delete room.customers[
                    customer.id
                ];

            }

        }


        /*
        Customer gets angry
        and leaves.

        Release whoever was
        working on them.
        */

        if (
            customer.patience <= 0
        ) {

            customer.claimedBy =
                null;

            customer.state =
                "leaving";

        }

    }


    /*
    Spawn customers.

    The chance is intentionally
    small because this function
    runs frequently.
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
   FIND AVAILABLE TASKS
===================================================== */

function findFuelCustomer(
    room
) {

    return Object.values(
        room.customers
    ).find(
        customer =>
            customer.state ===
            "waitingFuel" &&
            customer.claimedBy ===
            null
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
            "waitingCheckout" &&
            customer.claimedBy ===
            null
    );

}


function findCleaningTask(
    room
) {

    return room.tasks.find(
        task =>
            task.type ===
            "clean" &&
            !task.claimedBy
    );

}


/* =====================================================
   RELEASE TASK
===================================================== */

function releaseWorkerTask(
    room,
    workerId
) {

    /*
    Release customers.
    */

    for (
        const customer of
        Object.values(
            room.customers
        )
    ) {

        if (
            customer.claimedBy ===
            workerId
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


            else if (
                customer.state ===
                "checkingOut"
            ) {

                customer.state =
                    "waitingCheckout";

            }

        }

    }


    /*
    Release cleaning tasks.
    */

    for (
        const task of
        room.tasks
    ) {

        if (
            task.claimedBy ===
            workerId
        ) {

            task.claimedBy =
                null;

        }

    }

}


/* =====================================================
   PLAYER INTERACTION
===================================================== */

function interact(
    room,
    player
) {

    /*
    ACT while working
    cancels the current task.
    */

    if (
        player.task
    ) {

        releaseWorkerTask(
            room,
            player.id
        );

        player.task =
            null;

        return;

    }


    /* ---------------------------------------------
       FUELING
    --------------------------------------------- */

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
            ) <=
            60
        ) {

            const customer =
                findFuelCustomer(
                    room
                );


            if (
                customer &&
                room.fuel > 0
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


    /* ---------------------------------------------
       CASH REGISTER
    --------------------------------------------- */

    if (
        distance(
            player,
            STATIONS.register
        ) <=
        STATIONS.register.radius
    ) {

        const customer =
            findCheckoutCustomer(
                room
            );


        if (
            customer
        ) {

            customer.claimedBy =
                player.id;

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


    /* ---------------------------------------------
       PICK UP DELIVERY BOX
    --------------------------------------------- */

    if (
        distance(
            player,
            STATIONS.storage
        ) <=
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


    /* ---------------------------------------------
       RESTOCK
    --------------------------------------------- */

    if (
        distance(
            player,
            STATIONS.shelves
        ) <=
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


    /* ---------------------------------------------
       CLEAN
    --------------------------------------------- */

    if (
        distance(
            player,
            STATIONS.cleaning
        ) <=
        STATIONS.cleaning.radius
    ) {

        const task =
            findCleaningTask(
                room
            );


        if (
            task
        ) {

            task.claimedBy =
                player.id;


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


    /* ---------------------------------------------
       FUEL DELIVERY
    --------------------------------------------- */

    if (
        distance(
            player,
            STATIONS.delivery
        ) <=
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
   UPDATE PLAYER TASKS
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
            !customer ||
            customer.claimedBy !==
            worker.id
        ) {

            worker.task =
                null;

            return;

        }


        if (
            room.fuel <= 0
        ) {

            customer.claimedBy =
                null;

            customer.state =
                "waitingFuel";

            worker.task =
                null;

            return;

        }


        room.fuel =
            Math.max(
                0,
                room.fuel -
                0.15
            );


        customer.fuelProgress +=
            2;


        if (
            customer.fuelProgress >=
            100
        ) {

            if (
                !customer.paidFuel
            ) {

                room.money +=
                    15;

                customer.paidFuel =
                    true;

            }


            customer.claimedBy =
                null;


            if (
                customer.wantsStore &&
                room.stock > 0
            ) {

                customer.state =
                    "waitingCheckout";

            } else {

                customer.state =
                    "leaving";

            }


            worker.task =
                null;

        }

    }


    /* ---------------------------------------------
       CASHIER
    --------------------------------------------- */

    else if (
        task.type ===
        "cashier"
    ) {

        const customer =
            room.customers[
                task.customerId
            ];


        if (
            !customer ||
            customer.claimedBy !==
            worker.id
        ) {

            worker.task =
                null;

            return;

        }


        customer.checkoutProgress +=
            4;


        if (
            customer.checkoutProgress >=
            100
        ) {

            if (
                !customer.paidStore
            ) {

                room.money +=
                    customer.storePurchase;

                room.stock =
                    Math.max(
                        0,
                        room.stock -
                        1
                    );

                customer.paidStore =
                    true;

            }


            customer.claimedBy =
                null;

            customer.state =
                "leaving";


            worker.task =
                null;

        }

    }


    /* ---------------------------------------------
       RESTOCK
    --------------------------------------------- */

    else if (
        task.type ===
        "restock"
    ) {

        if (
            worker.carrying !==
            "box"
        ) {

            worker.task =
                null;

            return;

        }


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

    }


    /* ---------------------------------------------
       CLEAN
    --------------------------------------------- */

    else if (
        task.type ===
        "clean"
    ) {

        const cleanTask =
            room.tasks.find(
                t =>
                    t.id ===
                    task.taskId
            );


        if (
            !cleanTask
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


            room.tasks =
                room.tasks.filter(
                    t =>
                        t.id !==
                        task.taskId
                );


            worker.task =
                null;

        }

    }


    /* ---------------------------------------------
       FUEL DELIVERY
    --------------------------------------------- */

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


            worker.task =
                null;

        }

    }

}


/* =====================================================
   BOT AI
===================================================== */

/*
Bots are now general workers.

They don't have jobs.

They look for the most important
thing that needs doing.

Priority:

1. Fuel customers
2. Checkout customers
3. Restock
4. Clean
5. Fuel delivery
6. Wander
*/


function chooseBotTask(
    room,
    bot
) {

    if (
        bot.task
    ) {

        return;

    }


    /*
    FUEL
    */

    const fuelCustomer =
        findFuelCustomer(
            room
        );


    if (
        fuelCustomer &&
        room.fuel > 0
    ) {

        fuelCustomer.claimedBy =
            bot.id;

        fuelCustomer.state =
            "fueling";


        bot.task = {

            type:
                "fuel",

            customerId:
                fuelCustomer.id

        };


        return;

    }


    /*
    CHECKOUT
    */

    const checkoutCustomer =
        findCheckoutCustomer(
            room
        );


    if (
        checkoutCustomer
    ) {

        checkoutCustomer.claimedBy =
            bot.id;

        checkoutCustomer.state =
            "checkingOut";


        bot.task = {

            type:
                "cashier",

            customerId:
                checkoutCustomer.id

        };


        return;

    }


    /*
    RESTOCK

    Only do this when
    stock is getting low.
    */

    if (
        room.stock <=
        10 &&
        room.deliveryBoxes >
        0
    ) {

        bot.task = {

            type:
                "restock",

            phase:
                "pickup"

        };


        return;

    }


    /*
    CLEAN
    */

    const cleaningTask =
        findCleaningTask(
            room
        );


    if (
        cleaningTask
    ) {

        cleaningTask.claimedBy =
            bot.id;


        bot.task = {

            type:
                "clean",

            taskId:
                cleaningTask.id,

            progress:
                0

        };


        return;

    }


    /*
    FUEL DELIVERY
    */

    if (
        room.fuel <=
        25
    ) {

        bot.task = {

            type:
                "delivery",

            progress:
                0

        };


        return;

    }

}


function updateBot(
    room,
    bot
) {

    /*
    If the bot doesn't have
    a task, find one.
    */

    chooseBotTask(
        room,
        bot
    );


    if (
        !bot.task
    ) {

        /*
        No work.

        Slowly wander around
        the station.
        */

        if (
            !bot.wanderTarget ||
            distance(
                bot,
                bot.wanderTarget
            ) <
            10
        ) {

            bot.wanderTarget = {

                x:
                    200 +
                    Math.random() *
                    600,

                y:
                    150 +
                    Math.random() *
                    300

            };

        }


        moveTowards(
            bot,
            bot.wanderTarget.x,
            bot.wanderTarget.y,
            BOT_SPEED
        );


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
            STATIONS.pumps[
                customer.pumpIndex
            ];


        if (
            !moveTowards(
                bot,
                pump.x,
                pump.y + 45,
                BOT_SPEED
            )
        ) {

            return;

        }


        updateWorkerTask(
            room,
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
            !moveTowards(
                bot,
                STATIONS.register.x,
                STATIONS.register.y,
                BOT_SPEED
            )
        ) {

            return;

        }


        updateWorkerTask(
            room,
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
            task.phase ===
            "pickup"
        ) {

            if (
                moveTowards(
                    bot,
                    STATIONS.storage.x,
                    STATIONS.storage.y,
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

                    task.phase =
                        "deliver";

                } else {

                    bot.task =
                        null;

                }

            }


            return;

        }


        if (
            task.phase ===
            "deliver"
        ) {

            if (
                moveTowards(
                    bot,
                    STATIONS.shelves.x,
                    STATIONS.shelves.y,
                    BOT_SPEED
                )
            ) {

                updateWorkerTask(
                    room,
                    bot
                );

            }


            return;

        }

    }


    /* ---------------------------------------------
       CLEAN
    --------------------------------------------- */

    if (
        task.type ===
        "clean"
    ) {

        const cleanTask =
            room.tasks.find(
                t =>
                    t.id ===
                    task.taskId
            );


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
                cleanTask.x,
                cleanTask.y,
                BOT_SPEED
            )
        ) {

            updateWorkerTask(
                room,
                bot
            );

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

        if (
            moveTowards(
                bot,
                STATIONS.delivery.x,
                STATIONS.delivery.y,
                BOT_SPEED
            )
        ) {

            updateWorkerTask(
                room,
                bot
            );

        }


        return;

    }

}


/* =====================================================
   CLEANING TASKS
===================================================== */

function createCleaningTask(
    room
) {

    const exists =
        room.tasks.some(
            task =>
                task.type ===
                "clean"
        );


    if (
        exists
    ) {

        return;

    }


    room.tasks.push({

        id:
            "task_" +
            room.nextTaskId++,

        type:
            "clean",

        x:
            200 +
            Math.random() *
            500,

        y:
            150 +
            Math.random() *
            250,

        claimedBy:
            null

    });

}


/* =====================================================
   GAME UPDATE
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
    Players
    */

    for (
        const player of
        Object.values(
            room.players
        )
    ) {

        movePlayer(
            player
        );

        updateWorkerTask(
            room,
            player
        );

    }


    /*
    Customers
    */

    updateCustomers(
        room
    );


    /*
    Bots
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
    Clock
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
    Cleanliness slowly decreases.
    */

    room.cleanliness =
        Math.max(
            0,
            room.cleanliness -
            0.002
        );


    /*
    Occasionally create
    a cleaning task.
    */

    if (
        Math.random() <
        0.001
    ) {

        createCleaningTask(
            room
        );

    }

}


/* =====================================================
   PUBLIC STATE
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
                player => ({

                    id:
                        player.id,

                    name:
                        player.name,

                    x:
                        Math.round(
                            player.x
                        ),

                    y:
                        Math.round(
                            player.y
                        ),

                    color:
                        player.color,

                    carrying:
                        player.carrying,

                    task:
                        player.task
                            ? player.task.type
                            : null

                })
            ),


        bots:
            Object.values(
                room.bots
            ).map(
                bot => ({

                    id:
                        bot.id,

                    name:
                        bot.name,

                    x:
                        Math.round(
                            bot.x
                        ),

                    y:
                        Math.round(
                            bot.y
                        ),

                    carrying:
                        bot.carrying,

                    task:
                        bot.task
                            ? bot.task.type
                            : null

                })
            ),


        customers:
            Object.values(
                room.customers
            ).map(
                customer => ({

                    id:
                        customer.id,

                    x:
                        Math.round(
                            customer.x
                        ),

                    y:
                        Math.round(
                            customer.y
                        ),

                    state:
                        customer.state,

                    pumpIndex:
                        customer.pumpIndex,

                    fuelProgress:
                        Math.floor(
                            customer.fuelProgress
                        ),

                    checkoutProgress:
                        Math.floor(
                            customer.checkoutProgress
                        )

                })
            ),


        tasks:
            room.tasks.map(
                task => ({

                    id:
                        task.id,

                    type:
                        task.type,

                    x:
                        Math.round(
                            task.x
                        ),

                    y:
                        Math.round(
                            task.y
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
                        500,

                    color:
                        "#ff5555",

                    carrying:
                        null,

                    task:
                        null,

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
                        "The shift has already started."
                    );

                    return;

                }


                const playerCount =
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
                        cleanName(
                            data.name
                        ),

                    x:
                        420 +
                        playerCount *
                        35,

                    y:
                        500,

                    color:
                        [
                            "#ff5555",
                            "#4dabf7",
                            "#51cf66",
                            "#fcc419"
                        ][
                            playerCount
                        ],

                    carrying:
                        null,

                    task:
                        null,

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


        /* ---------------------------------------------
           START GAME
        --------------------------------------------- */

        socket.on(
            "startGame",
            () => {

                const room =
                    getPlayerRoom(
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
           INPUT
        --------------------------------------------- */

        socket.on(
            "input",
            input => {

                const room =
                    getPlayerRoom(
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


        /* ---------------------------------------------
           INTERACT
        --------------------------------------------- */

        socket.on(
            "interact",
            () => {

                const room =
                    getPlayerRoom(
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

                    interact(
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
                    getPlayerRoom(
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


                room.bots[id] = {

                    id,

                    name:
                        "Employee " +
                        room.nextBotId,

                    x:
                        600,

                    y:
                        500,

                    carrying:
                        null,

                    task:
                        null,

                    wanderTarget:
                        null

                };


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
                    getPlayerRoom(
                        socket.id
                    );


                if (
                    !room ||
                    !room.started
                ) {

                    return;

                }


                /*
                Extra pump
                */

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


                /*
                Bigger shelves
                */

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


                /*
                More employees
                */

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
                    getPlayerRoom(
                        socket.id
                    );


                if (
                    !room
                ) {

                    return;

                }


                releaseWorkerTask(
                    room,
                    socket.id
                );


                delete room.players[
                    socket.id
                ];


                /*
                Transfer host.
                */

                if (
                    room.hostId ===
                    socket.id
                ) {

                    const remaining =
                        Object.keys(
                            room.players
                        );


                    if (
                        remaining.length >
                        0
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


/* =====================================================
   SERVER GAME LOOP
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
    SERVER_TICK
);


/* =====================================================
   STATE BROADCAST LOOP
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
    BROADCAST_TICK
);


/* =====================================================
   ROUTE
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
