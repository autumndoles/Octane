
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    transports: ["polling", "websocket"],
    pingInterval: 25000,
    pingTimeout: 10000,
    maxHttpBufferSize: 100000,
    cors: {
        origin: "*"
    }
});

const PORT = process.env.PORT || 3000;


/* =====================================================
   OCTANE
   Cooperative Gas Station Simulator
===================================================== */


/* =====================================================
   GAME SETTINGS
===================================================== */

const WORLD_WIDTH = 640;
const WORLD_HEIGHT = 360;

const MAX_PLAYERS = 4;
const MAX_BOTS = 4;

const STARTING_MONEY = 100;

const PLAYER_SPEED = 3.2;
const BOT_SPEED = 2.3;

const SIMULATION_RATE = 10;
const NETWORK_RATE = 10;

const CUSTOMER_LIMIT = 10;

const TASK_TIMEOUT = 8000;


/* =====================================================
   STATION LOCATIONS
===================================================== */

const STATION = {

    register: {
        x: 145,
        y: 105
    },

    shelves: {
        x: 255,
        y: 105
    },

    storage: {
        x: 255,
        y: 280
    },

    restroom: {
        x: 80,
        y: 110
    },

    cleaning: {
        x: 100,
        y: 255
    },

    delivery: {
        x: 515,
        y: 300
    },

    pumps: [

        {
            x: 390,
            y: 80
        },

        {
            x: 490,
            y: 80
        },

        {
            x: 390,
            y: 180
        },

        {
            x: 490,
            y: 180
        }

    ]

};


/* =====================================================
   ROOM STORAGE
===================================================== */

const rooms = Object.create(null);

let nextRoomNumber = 1;


/* =====================================================
   UTILITY
===================================================== */

function randomRoomCode() {

    const characters =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

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

    return code;

}


function sanitizeName(name) {

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

    const length =
        Math.sqrt(
            dx * dx +
            dy * dy
        );


    if (
        length <= speed
    ) {

        worker.x =
            target.x;

        worker.y =
            target.y;

        return true;

    }


    worker.x +=
        dx /
        length *
        speed;

    worker.y +=
        dy /
        length *
        speed;


    return false;

}


/* =====================================================
   CREATE ROOM
===================================================== */

function createRoom() {

    let code;

    do {

        code =
            randomRoomCode();

    } while (
        rooms[code]
    );


    const room = {

        id:
            nextRoomNumber++,

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
            50,

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

            employees:
                1,

            shelves:
                1

        }

    };


    rooms[code] =
        room;


    return room;

}


/* =====================================================
   FIND ROOM
===================================================== */

function findRoomByPlayer(
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
   CREATE WORKER
===================================================== */

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


        input: {

            up:
                false,

            down:
                false,

            left:
                false,

            right:
                false

        },


        task:
            null,

        carrying:
            null,


        lastThink:
            0,

        lastMoved:
            Date.now(),

        lastX:
            x,

        lastY:
            y

    };

}


/* =====================================================
   TASK SYSTEM
===================================================== */

function createTask(
    room,
    type,
    x,
    y,
    priority = 1
) {

    const id =
        "task_" +
        room.nextTaskId++;


    room.tasks[id] = {

        id,

        type,

        x,

        y,

        priority,

        claimedBy:
            null,

        claimedAt:
            0

    };


    return room.tasks[id];

}


function findTask(
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
   RELEASE TASK
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

            stationTask.claimedBy =
                null;

            stationTask.claimedAt =
                0;

        }

    }


    if (
        task.customerId
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
                "shopping"
            ) {

                customer.state =
                    "waitingCheckout";

            }

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
        CUSTOMER_LIMIT
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
            625,

        y:
            330,


        state:
            "entering",


        pumpIndex,


        fuelProgress:
            0,

        shopProgress:
            0,

        restroomProgress:
            0,


        patience:
            100,


        claimedBy:
            null

    };

}


/* =====================================================
   CUSTOMER UPDATE
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

        if (
            customer.state ===
            "entering"
        ) {

            customer.x -=
                1.5;


            if (
                customer.x <=
                560
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


        else if (
            customer.state ===
            "waitingFuel"
        ) {

            customer.patience -=
                0.03;

        }


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


        else if (
            customer.state ===
            "waitingCheckout"
        ) {

            customer.patience -=
                0.03;

        }


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

                if (
                    room.stock >
                    0
                ) {

                    room.stock--;

                    room.money +=
                        10;

                }


                customer.claimedBy =
                    null;

                customer.state =
                    "leaving";

            }

        }


        else if (
            customer.state ===
            "waitingRestroom"
        ) {

            customer.patience -=
                0.03;


            if (
                Math.random() <
                0.01
            ) {

                customer.state =
                    "usingRestroom";

            }

        }


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

                createTask(
                    room,
                    "clean",
                    80,
                    110,
                    2
                );


                customer.state =
                    "leaving";

            }

        }


        else if (
            customer.state ===
            "leaving"
        ) {

            customer.x +=
                2;


            if (
                customer.x >
                660
            ) {

                delete room.customers[
                    customer.id
                ];

            }

        }


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
    Customer spawn rate.
    */

    if (
        Math.random() <
        0.025
    ) {

        createCustomer(
            room
        );

    }

}


/* =====================================================
   PLAYER MOVEMENT
===================================================== */

function updatePlayer(
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
        dx !== 0 ||
        dy !== 0
    ) {

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
                WORLD_WIDTH -
                10
            );


        player.y =
            clamp(
                player.y,
                10,
                WORLD_HEIGHT -
                10
            );


        player.lastMoved =
            Date.now();

    }


    updateWorkerTask(
        roomForWorker(player),
        player
    );

}


function roomForWorker(
    worker
) {

    for (
        const room of
        Object.values(rooms)
    ) {

        if (
            room.players[
                worker.id
            ] ||
            room.bots[
                worker.id
            ]
        ) {

            return room;

        }

    }

    return null;

}


/* =====================================================
   WORKER TASKS
===================================================== */

function updateWorkerTask(
    room,
    worker
) {

    if (
        !room ||
        !worker.task
    ) {

        return;

    }


    const task =
        worker.task;


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
            0.12;


        customer.fuelProgress +=
            2;


        if (
            customer.fuelProgress >=
            100
        ) {

            room.money +=
                15;


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


            customer.claimedBy =
                null;


            worker.task =
                null;

        }

    }


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

            if (
                room.stock >
                0
            ) {

                room.stock--;

                room.money +=
                    10;

            }


            customer.claimedBy =
                null;

            customer.state =
                "leaving";


            worker.task =
                null;

        }

    }


    else if (
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
                    15
                );


            delete room.tasks[
                task.taskId
            ];


            worker.task =
                null;

        }

    }


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


            worker.carrying =
                null;


            worker.task =
                null;

        }

    }


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
   PLAYER INTERACTION
===================================================== */

function interact(
    room,
    player
) {

    if (
        !room ||
        !room.started
    ) {

        return;

    }


    /*
    Cancel current action.
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
            35
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
    Checkout.
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
    Storage pickup.
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


    /*
    Restock shelves.
    */

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
        findTask(
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
        40 &&
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
        bot.lastThink <
        800
    ) {

        return;

    }


    bot.lastThink =
        now;


    if (
        bot.task
    ) {

        return;

    }


    /*
    Fuel customers.
    */

    const fuelCustomer =
        Object.values(
            room.customers
        ).find(
            c =>
                c.state ===
                "waitingFuel" &&

                !c.claimedBy &&

                room.fuel >
                0
        );


    if (
        fuelCustomer
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
        room.stock <
        10 &&
        room.deliveryBoxes >
        0
    ) {

        bot.task = {

            type:
                "pickup"

        };


        return;

    }


    /*
    Cleaning.
    */

    const cleanTask =
        findTask(
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


    if (
        bot.task &&
        now -
        bot.lastMoved >
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

    }


    else if (
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

    }


    else if (
        task.type ===
        "pickup"
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

    }


    else if (
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

    }


    else if (
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

    }


    else if (
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

    }


    const moved =
        Math.abs(
            bot.x -
            bot.lastX
        ) > 0.1 ||

        Math.abs(
            bot.y -
            bot.lastY
        ) > 0.1;


    if (
        moved
    ) {

        bot.lastX =
            bot.x;

        bot.lastY =
            bot.y;

        bot.lastMoved =
            now;

    }

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


    for (
        const player of
        Object.values(
            room.players
        )
    ) {

        updatePlayer(
            player
        );

    }


    updateCustomers(
        room
    );


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
    Game clock.
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
    Cleanliness slowly decreases.
    */

    room.cleanliness =
        Math.max(
            0,
            room.cleanliness -
            0.003
        );


    /*
    Release abandoned tasks.
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

            task.claimedBy =
                null;

            task.claimedAt =
                0;

        }

    }

}


/* =====================================================
   BUILD NETWORK STATE
===================================================== */

function buildState(
    room
) {

    return {

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

                    type:
                        customer.type,

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

                    shopProgress:
                        Math.floor(
                            customer.shopProgress
                        )

                })
            ),


        tasks:
            Object.values(
                room.tasks
            ).map(
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
            ),


        upgrades:
            room.upgrades

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

        console.log(
            "Connected:",
            socket.id
        );


        /*
        Create station.
        */

        socket.on(
            "createRoom",
            name => {

                try {

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

                            sanitizeName(
                                name
                            ),

                            160,

                            300,

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


                    console.log(
                        "Room created:",
                        room.code
                    );

                }

                catch (
                    error
                ) {

                    console.error(
                        "Create room error:",
                        error
                    );


                    socket.emit(
                        "errorMessage",
                        "Could not create station."
                    );

                }

            }
        );


        /*
        Join station.
        */

        socket.on(
            "joinRoom",
            data => {

                try {

                    const code =
                        String(
                            data &&
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


                    const playerCount =
                        Object.keys(
                            room.players
                        ).length;


                    if (
                        playerCount >=
                        MAX_PLAYERS
                    ) {

                        socket.emit(
                            "errorMessage",
                            "This station is full."
                        );

                        return;

                    }


                    const colors = [

                        "#ff5555",

                        "#4dabf7",

                        "#51cf66",

                        "#fcc419"

                    ];


                    socket.join(
                        room.code
                    );


                    room.players[
                        socket.id
                    ] =
                        createWorker(

                            socket.id,

                            sanitizeName(
                                data.name
                            ),

                            160 +
                            playerCount *
                            30,

                            300,

                            "player",

                            colors[
                                playerCount
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


                    console.log(
                        "Player joined:",
                        room.code
                    );

                }

                catch (
                    error
                ) {

                    console.error(
                        "Join room error:",
                        error
                    );


                    socket.emit(
                        "errorMessage",
                        "Could not join station."
                    );

                }

            }
        );


        /*
        Start game.
        */

        socket.on(
            "startGame",
            () => {

                const room =
                    findRoomByPlayer(
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
        Movement.
        */

        socket.on(
            "input",
            input => {

                const room =
                    findRoomByPlayer(
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


        /*
        Interaction.
        */

        socket.on(
            "interact",
            () => {

                const room =
                    findRoomByPlayer(
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

                    interact(
                        room,
                        player
                    );

                }

            }
        );


        /*
        Hire bot.
        */

        socket.on(
            "hireBot",
            () => {

                const room =
                    findRoomByPlayer(
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


                const botCount =
                    Object.keys(
                        room.bots
                    ).length;


                if (
                    botCount >=
                    Math.min(
                        MAX_BOTS,
                        room.upgrades
                            .employees
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

                        320,

                        300,

                        "bot",

                        "#b36bff"

                    );


                broadcastRoom(
                    room
                );

            }
        );


        /*
        Upgrades.
        */

        socket.on(
            "upgrade",
            type => {

                const room =
                    findRoomByPlayer(
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

                    room.upgrades.shelves++;

                    room.maxStock +=
                        25;

                }


                else if (
                    type ===
                    "employees" &&

                    room.money >=
                    300 &&

                    room.upgrades.employees <
                    MAX_BOTS
                ) {

                    room.money -=
                        300;

                    room.upgrades.employees++;

                }


                broadcastRoom(
                    room
                );

            }
        );


        /*
        Disconnect.
        */

        socket.on(
            "disconnect",
            reason => {

                console.log(
                    "Disconnected:",
                    socket.id,
                    reason
                );


                const room =
                    findRoomByPlayer(
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
   GAME LOOP
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
    1000 /
    SIMULATION_RATE
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
    1000 /
    NETWORK_RATE
);


/* =====================================================
   EXPRESS
===================================================== */

app.use(
    express.static(
        __dirname
    )
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


/* =====================================================
   SERVER START
===================================================== */

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Octane server running on port ${PORT}`
        );

    }
);
