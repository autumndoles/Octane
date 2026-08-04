
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    },
    transports: ["polling", "websocket"]
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});


/* =========================================================
   CONFIGURATION
========================================================= */

const MAX_PLAYERS = 4;

const STARTING_MONEY = 100;

const STARTING_FUEL = 50;
const STARTING_MAX_FUEL = 100;

const STARTING_STOCK = 20;
const STARTING_MAX_STOCK = 40;

const DELIVERY_BOXES_PER_TRUCK = 5;

const CUSTOMER_SPAWN_TIME = 5000;

const PLAYER_SPEED = 2.5;

const BOT_SPEED = 1.8;

const CUSTOMER_SPEED = 1.2;


/* =========================================================
   ROOMS
========================================================= */

const rooms = new Map();


/* =========================================================
   UTILITY
========================================================= */

function generateRoomCode() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

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

    return code;

}


function getRoom(code) {

    return rooms.get(
        code
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


function moveToward(
    entity,
    target,
    speed
) {

    const dx =
        target.x -
        entity.x;

    const dy =
        target.y -
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
            target.x;

        entity.y =
            target.y;

        return true;

    }


    entity.x +=
        (
            dx /
            dist
        ) *
        speed;


    entity.y +=
        (
            dy /
            dist
        ) *
        speed;


    return false;

}


/* =========================================================
   STATION LOCATIONS
========================================================= */

const LOCATIONS = {

    register: {
        x: 150,
        y: 105
    },

    shelves: {
        x: 247,
        y: 105
    },

    storage: {
        x: 247,
        y: 260
    },

    cleaning: {
        x: 87,
        y: 235
    },

    restroom: {
        x: 82,
        y: 157
    },

    delivery: {
        x: 517,
        y: 290
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


/* =========================================================
   ROOM CREATION
========================================================= */

function createRoom(
    hostId
) {

    return {

        code:
            generateRoomCode(),

        hostId,

        started:
            false,

        day:
            1,

        money:
            STARTING_MONEY,

        fuel:
            STARTING_FUEL,

        maxFuel:
            STARTING_MAX_FUEL,

        stock:
            STARTING_STOCK,

        maxStock:
            STARTING_MAX_STOCK,

        cleanliness:
            100,


        players:
            [],


        bots:
            [],


        customers:
            [],


        tasks:
            [],


        delivery: {

            ordered:
                false,

            truckArrived:
                false,

            boxes:
                0,

            maxBoxes:
                DELIVERY_BOXES_PER_TRUCK

        },


        upgrades: {

            pumps:
                2,

            shelves:
                1,

            employees:
                1

        },


        stats: {

            customersServed:
                0,

            customersLost:
                0,

            deliveries:
                0

        },


        nextCustomerId:
            1,

        nextBotId:
            1,

        nextTaskId:
            1

    };

}


/* =========================================================
   PUBLIC STATE
========================================================= */

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

        day:
            room.day,

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

        cleanliness:
            Math.floor(
                room.cleanliness
            ),


        players:
            room.players.map(
                player => ({

                    id:
                        player.id,

                    name:
                        player.name,

                    x:
                        player.x,

                    y:
                        player.y,

                    color:
                        player.color,

                    carrying:
                        player.carrying

                })
            ),


        bots:
            room.bots.map(
                bot => ({

                    id:
                        bot.id,

                    name:
                        bot.name,

                    x:
                        bot.x,

                    y:
                        bot.y,

                    color:
                        "#ff922b",

                    carrying:
                        bot.carrying,

                    task:
                        bot.task

                })
            ),


        customers:
            room.customers.map(
                customer => ({

                    id:
                        customer.id,

                    x:
                        customer.x,

                    y:
                        customer.y,

                    type:
                        customer.type,

                    state:
                        customer.state,

                    target:
                        customer.target,

                    fuelProgress:
                        customer.fuelProgress,

                    patience:
                        customer.patience

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
                        task.x,

                    y:
                        task.y

                })
            ),


        delivery: {

            ordered:
                room.delivery.ordered,

            truckArrived:
                room.delivery.truckArrived,

            boxes:
                room.delivery.boxes

        },


        upgrades:
            room.upgrades,


        stats:
            room.stats

    };

}


function broadcastState(
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


/* =========================================================
   PLAYER COLORS
========================================================= */

const PLAYER_COLORS = [

    "#4dabf7",

    "#ff6b6b",

    "#69db7c",

    "#da77f2"

];


/* =========================================================
   CREATE ROOM
========================================================= */

io.on(
    "connection",
    socket => {


        socket.on(
            "createRoom",
            name => {

                if (
                    !name ||
                    typeof name !==
                    "string"
                ) {

                    return;

                }


                let roomCode =
                    generateRoomCode();


                while (
                    rooms.has(
                        roomCode
                    )
                ) {

                    roomCode =
                        generateRoomCode();

                }


                const room =
                    createRoom(
                        socket.id
                    );


                room.code =
                    roomCode;


                room.players.push({

                    id:
                        socket.id,

                    name:
                        name
                            .trim()
                            .slice(
                                0,
                                20
                            ),

                    x:
                        150,

                    y:
                        150,

                    color:
                        PLAYER_COLORS[0],

                    carrying:
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

                });


                rooms.set(
                    roomCode,
                    room
                );


                socket.join(
                    roomCode
                );


                socket.roomCode =
                    roomCode;


                socket.emit(
                    "joined",
                    {

                        roomCode,

                        playerId:
                            socket.id,

                        isHost:
                            true

                    }
                );


                broadcastState(
                    room
                );

            }
        );


/* =========================================================
   JOIN ROOM
========================================================= */

        socket.on(
            "joinRoom",
            data => {

                if (
                    !data ||
                    !data.name ||
                    !data.code
                ) {

                    return;

                }


                const room =
                    rooms.get(
                        data.code
                            .trim()
                            .toUpperCase()
                    );


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
                        "This shift has already started."
                    );

                    return;

                }


                if (
                    room.players.length >=
                    MAX_PLAYERS
                ) {

                    socket.emit(
                        "errorMessage",
                        "This station is full."
                    );

                    return;

                }


                const index =
                    room.players.length;


                room.players.push({

                    id:
                        socket.id,

                    name:
                        data.name
                            .trim()
                            .slice(
                                0,
                                20
                            ),

                    x:
                        150 +
                        index *
                        25,

                    y:
                        150,

                    color:
                        PLAYER_COLORS[
                            index
                        ],

                    carrying:
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

                });


                socket.join(
                    room.code
                );


                socket.roomCode =
                    room.code;


                socket.emit(
                    "joined",
                    {

                        roomCode:
                            room.code,

                        playerId:
                            socket.id,

                        isHost:
                            room.hostId ===
                            socket.id

                    }
                );


                broadcastState(
                    room
                );

            }
        );


/* =========================================================
   START GAME
========================================================= */

        socket.on(
            "startGame",
            () => {

                const room =
                    rooms.get(
                        socket.roomCode
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


                spawnCustomer(
                    room
                );


                broadcastState(
                    room
                );

            }
        );


/* =========================================================
   PLAYER INPUT
========================================================= */

        socket.on(
            "input",
            input => {

                const room =
                    rooms.get(
                        socket.roomCode
                    );


                if (
                    !room
                ) {

                    return;

                }


                const player =
                    room.players.find(
                        p =>
                            p.id ===
                            socket.id
                    );


                if (
                    !player
                ) {

                    return;

                }


                player.input =
                    input || {};

            }
        );


/* =========================================================
   PLAYER INTERACTION
========================================================= */

        socket.on(
            "interact",
            () => {

                const room =
                    rooms.get(
                        socket.roomCode
                    );


                if (
                    !room ||
                    !room.started
                ) {

                    return;

                }


                const player =
                    room.players.find(
                        p =>
                            p.id ===
                            socket.id
                    );


                if (
                    !player
                ) {

                    return;

                }


                handlePlayerInteraction(
                    room,
                    player
                );


                broadcastState(
                    room
                );

            }
        );


/* =========================================================
   HIRE BOT
========================================================= */

        socket.on(
            "hireBot",
            () => {

                const room =
                    rooms.get(
                        socket.roomCode
                    );


                if (
                    !room ||
                    !room.started
                ) {

                    return;

                }


                if (
                    room.bots.length >=
                    room.upgrades.employees
                ) {

                    socket.emit(
                        "errorMessage",
                        "You need more employee capacity."
                    );

                    return;

                }


                const cost =
                    50;


                if (
                    room.money <
                    cost
                ) {

                    socket.emit(
                        "errorMessage",
                        "You need $50 to hire a worker."
                    );

                    return;

                }


                room.money -=
                    cost;


                room.bots.push({

                    id:
                        "bot-" +
                        room.nextBotId++,

                    name:
                        "Worker " +
                        room.nextBotId,

                    x:
                        170,

                    y:
                        150,

                    carrying:
                        null,

                    task:
                        null,

                    state:
                        "idle",

                    target:
                        null

                });


                broadcastState(
                    room
                );

            }
        );


/* =========================================================
   UPGRADE
========================================================= */

        socket.on(
            "upgrade",
            type => {

                const room =
                    rooms.get(
                        socket.roomCode
                    );


                if (
                    !room
                ) {

                    return;

                }


                let cost =
                    0;


                if (
                    type ===
                    "pump"
                ) {

                    if (
                        room.upgrades.pumps >=
                        4
                    ) {

                        return;

                    }


                    cost =
                        250;

                }


                if (
                    type ===
                    "shelves"
                ) {

                    cost =
                        200;

                }


                if (
                    type ===
                    "employees"
                ) {

                    cost =
                        300;

                }


                if (
                    room.money <
                    cost
                ) {

                    socket.emit(
                        "errorMessage",
                        "Not enough money."
                    );

                    return;

                }


                room.money -=
                    cost;


                if (
                    type ===
                    "pump"
                ) {

                    room.upgrades.pumps++;

                }


                if (
                    type ===
                    "shelves"
                ) {

                    room.upgrades.shelves++;

                    room.maxStock +=
                        20;

                }


                if (
                    type ===
                    "employees"
                ) {

                    room.upgrades.employees++;

                }


                broadcastState(
                    room
                );

            }
        );


    }
);


/* =========================================================
   PLAYER MOVEMENT
========================================================= */

function updatePlayers(
    room
) {

    for (
        const player of
        room.players
    ) {

        const input =
            player.input ||
            {};


        let dx =
            0;

        let dy =
            0;


        if (
            input.up
        ) {

            dy -=
                1;

        }


        if (
            input.down
        ) {

            dy +=
                1;

        }


        if (
            input.left
        ) {

            dx -=
                1;

        }


        if (
            input.right
        ) {

            dx +=
                1;

        }


        if (
            dx !==
            0 ||
            dy !==
            0
        ) {

            const length =
                Math.sqrt(
                    dx * dx +
                    dy * dy
                );


            player.x +=
                (
                    dx /
                    length
                ) *
                PLAYER_SPEED;


            player.y +=
                (
                    dy /
                    length
                ) *
                PLAYER_SPEED;

        }


        player.x =
            Math.max(
                10,
                Math.min(
                    630,
                    player.x
                )
            );


        player.y =
            Math.max(
                10,
                Math.min(
                    305,
                    player.y
                )
            );

    }

}


/* =========================================================
   CUSTOMER SPAWNING
========================================================= */

function spawnCustomer(
    room
) {

    if (
        room.customers.length >=
        12
    ) {

        return;

    }


    const types = [

        "fuel",

        "shop",

        "fuelShop",

        "restroom"

    ];


    const type =
        types[
            Math.floor(
                Math.random() *
                types.length
            )
        ];


    const customer = {

        id:
            "customer-" +
            room.nextCustomerId++,

        x:
            620,

        y:
            320,

        type,

        state:
            "entering",

        target:
            null,

        patience:
            100,

        fuelProgress:
            0,

        shopProgress:
            0,

        timer:
            0,

        pump:
            null

    };


    room.customers.push(
        customer
    );

}


/* =========================================================
   CUSTOMER AI
========================================================= */

function updateCustomers(
    room
) {

    for (
        let i =
            room.customers.length -
            1;

        i >=
        0;

        i--
    ) {

        const customer =
            room.customers[i];


        customer.timer++;


        /*
        ENTERING
        */

        if (
            customer.state ===
            "entering"
        ) {

            customer.target = {

                x:
                    330,

                y:
                    280

            };


            if (
                moveToward(
                    customer,
                    customer.target,
                    CUSTOMER_SPEED
                )
            ) {

                if (
                    customer.type ===
                    "fuel"
                ) {

                    assignPump(
                        room,
                        customer
                    );

                }

                else if (
                    customer.type ===
                    "shop"
                ) {

                    customer.state =
                        "walkingShop";

                }

                else if (
                    customer.type ===
                    "fuelShop"
                ) {

                    assignPump(
                        room,
                        customer
                    );

                }

                else if (
                    customer.type ===
                    "restroom"
                ) {

                    customer.state =
                        "walkingRestroom";

                }

            }

        }


        /*
        WALK TO SHOP
        */

        if (
            customer.state ===
            "walkingShop"
        ) {

            customer.target =
                LOCATIONS.shelves;


            if (
                moveToward(
                    customer,
                    customer.target,
                    CUSTOMER_SPEED
                )
            ) {

                customer.state =
                    "shopping";

            }

        }


        /*
        SHOPPING
        */

        if (
            customer.state ===
            "shopping"
        ) {

            if (
                room.stock >
                0
            ) {

                if (
                    customer.timer %
                    20 ===
                    0
                ) {

                    customer.shopProgress +=
                        10;

                }


                if (
                    customer.shopProgress >=
                    100
                ) {

                    room.stock--;

                    room.money +=
                        8;

                    room.stats.customersServed++;

                    customer.state =
                        "leaving";

                }

            }

            else {

                customer.patience -=
                    1;

            }

        }


        /*
        WALK TO RESTROOM
        */

        if (
            customer.state ===
            "walkingRestroom"
        ) {

            customer.target =
                LOCATIONS.restroom;


            if (
                moveToward(
                    customer,
                    customer.target,
                    CUSTOMER_SPEED
                )
            ) {

                customer.state =
                    "usingRestroom";

            }

        }


        /*
        RESTROOM
        */

        if (
            customer.state ===
            "usingRestroom"
        ) {

            if (
                customer.timer %
                20 ===
                0
            ) {

                customer.patience -=
                    1;

            }


            if (
                customer.timer >
                100
            ) {

                customer.state =
                    "leaving";

                room.money +=
                    3;

                room.stats.customersServed++;

            }

        }


        /*
        FUELING
        */

        if (
            customer.state ===
            "fueling"
        ) {

            if (
                room.fuel >
                0
            ) {

                if (
                    customer.timer %
                    5 ===
                    0
                ) {

                    room.fuel--;

                    customer.fuelProgress +=
                        5;

                }


                if (
                    customer.fuelProgress >=
                    100
                ) {

                    room.money +=
                        15;

                    room.stats.customersServed++;


                    if (
                        customer.type ===
                        "fuelShop"
                    ) {

                        customer.state =
                            "walkingShop";

                        customer.timer =
                            0;

                    }

                    else {

                        customer.state =
                            "leaving";

                    }

                }

            }

            else {

                customer.patience -=
                    1;

            }

        }


        /*
        WAITING FOR PUMP
        */

        if (
            customer.state ===
            "waitingPump"
        ) {

            customer.patience -=
                0.1;


            if (
                customer.patience <=
                0
            ) {

                room.stats.customersLost++;

                customer.state =
                    "leaving";

            }

        }


        /*
        LEAVING
        */

        if (
            customer.state ===
            "leaving"
        ) {

            customer.target = {

                x:
                    650,

                y:
                    320

            };


            moveToward(
                customer,
                customer.target,
                CUSTOMER_SPEED
            );


            if (
                customer.x >
                640
            ) {

                room.customers.splice(
                    i,
                    1
                );

            }

        }


        /*
        PATIENCE
        */

        if (
            customer.state !==
            "leaving"
        ) {

            if (
                customer.timer %
                60 ===
                0
            ) {

                customer.patience -=
                    0.5;

            }


            if (
                customer.patience <=
                0
            ) {

                room.stats.customersLost++;

                customer.state =
                    "leaving";

            }

        }

    }

}


/* =========================================================
   PUMP ASSIGNMENT
========================================================= */

function assignPump(
    room,
    customer
) {

    const occupied =
        room.customers
            .filter(
                c =>
                    c.pump !==
                    null &&
                    c.state !==
                    "leaving"
            )
            .map(
                c =>
                    c.pump
            );


    for (
        let i = 0;

        i <
        room.upgrades.pumps;

        i++
    ) {

        if (
            !occupied.includes(
                i
            )
        ) {

            customer.pump =
                i;


            customer.target =
                LOCATIONS.pumps[i];


            customer.state =
                "walkingPump";


            return;

        }

    }


    customer.state =
        "waitingPump";

}


function updateCustomerPumps(
    room
) {

    for (
        const customer of
        room.customers
    ) {

        if (
            customer.state ===
            "walkingPump"
        ) {

            if (
                !customer.target
            ) {

                continue;

            }


            if (
                moveToward(
                    customer,
                    customer.target,
                    CUSTOMER_SPEED
                )
            ) {

                customer.state =
                    "fueling";

                customer.timer =
                    0;

            }

        }

    }

}


/* =========================================================
   PLAYER INTERACTION
========================================================= */

function handlePlayerInteraction(
    room,
    player
) {

    /*
    Pick up delivery box.
    */

    if (
        room.delivery.truckArrived &&
        room.delivery.boxes >
        0 &&
        distance(
            player,
            LOCATIONS.delivery
        ) <
        40
    ) {

        if (
            !player.carrying
        ) {

            player.carrying =
                "deliveryBox";

            room.delivery.boxes--;

            return;

        }

    }


    /*
    Put delivery box into storage.
    */

    if (
        player.carrying ===
        "deliveryBox" &&
        distance(
            player,
            LOCATIONS.storage
        ) <
        40
    ) {

        if (
            room.stock <
            room.maxStock
        ) {

            room.stock +=
                10;

            player.carrying =
                null;

            return;

        }

    }


    /*
    Clean.
    */

    if (
        distance(
            player,
            LOCATIONS.cleaning
        ) <
        40
    ) {

        room.cleanliness =
            Math.min(
                100,
                room.cleanliness +
                10
            );

        return;

    }


    /*
    Order delivery.
    */

    if (
        distance(
            player,
            LOCATIONS.delivery
        ) <
        50
    ) {

        orderDelivery(
            room
        );

        return;

    }


    /*
    Restock shelves.
    */

    if (
        distance(
            player,
            LOCATIONS.shelves
        ) <
        40
    ) {

        if (
            room.stock >
            0
        ) {

            room.stock =
                Math.max(
                    0,
                    room.stock -
                    1
                );

        }

    }

}


/* =========================================================
   DELIVERY SYSTEM
========================================================= */

function orderDelivery(
    room
) {

    if (
        room.delivery.ordered
    ) {

        return;

    }


    if (
        room.money <
        30
    ) {

        return;

    }


    room.money -=
        30;


    room.delivery.ordered =
        true;


    room.delivery.truckArrived =
        false;


    setTimeout(
        () => {

            if (
                !rooms.has(
                    room.code
                )
            ) {

                return;

            }


            room.delivery.truckArrived =
                true;


            room.delivery.boxes =
                DELIVERY_BOXES_PER_TRUCK;


            room.stats.deliveries++;


            broadcastState(
                room
            );

        },

        8000
    );

}


/* =========================================================
   BOT AI
========================================================= */

function updateBots(
    room
) {

    for (
        const bot of
        room.bots
    ) {

        /*
        If carrying a box,
        take it to storage.
        */

        if (
            bot.carrying ===
            "deliveryBox"
        ) {

            bot.task =
                "unloading";


            bot.target =
                LOCATIONS.storage;


            if (
                moveToward(
                    bot,
                    bot.target,
                    BOT_SPEED
                )
            ) {

                if (
                    room.stock <
                    room.maxStock
                ) {

                    room.stock +=
                        10;

                }


                bot.carrying =
                    null;

                bot.task =
                    null;

            }


            continue;

        }


        /*
        Pick up delivery box.
        */

        if (
            room.delivery.truckArrived &&
            room.delivery.boxes >
            0
        ) {

            bot.task =
                "delivery";


            bot.target =
                LOCATIONS.delivery;


            if (
                moveToward(
                    bot,
                    bot.target,
                    BOT_SPEED
                )
            ) {

                bot.carrying =
                    "deliveryBox";

            }


            continue;

        }


        /*
        Clean if station is dirty.
        */

        if (
            room.cleanliness <
            70
        ) {

            bot.task =
                "cleaning";


            bot.target =
                LOCATIONS.cleaning;


            if (
                moveToward(
                    bot,
                    bot.target,
                    BOT_SPEED
                )
            ) {

                room.cleanliness =
                    Math.min(
                        100,
                        room.cleanliness +
                        1
                    );

            }


            continue;

        }


        /*
        Help with customers.
        */

        const customer =
            room.customers.find(
                c =>
                    c.state ===
                    "waitingPump"
            );


        if (
            customer
        ) {

            bot.task =
                "customer";


            bot.target = {

                x:
                    customer.x,

                y:
                    customer.y

            };


            if (
                moveToward(
                    bot,
                    bot.target,
                    BOT_SPEED
                )
            ) {

                if (
                    room.fuel >
                    0
                ) {

                    room.fuel--;

                    customer.fuelProgress +=
                        5;


                    if (
                        customer.fuelProgress >=
                        100
                    ) {

                        room.money +=
                            15;

                        room.stats.customersServed++;

                        customer.state =
                            "leaving";

                    }

                }

            }


            continue;

        }


        /*
        Restock if stock is low.
        */

        if (
            room.stock <
            room.maxStock *
            0.3
        ) {

            bot.task =
                "restock";


            bot.target =
                LOCATIONS.shelves;


            if (
                moveToward(
                    bot,
                    bot.target,
                    BOT_SPEED
                )
            ) {

                if (
                    room.stock <
                    room.maxStock
                ) {

                    room.stock++;

                }

            }


            continue;

        }


        /*
        Idle.
        */

        bot.task =
            "idle";

        bot.target =
            null;

    }

}


/* =========================================================
   RANDOM MESSES
========================================================= */

function createMess(
    room
) {

    if (
        room.tasks.length >=
        5
    ) {

        return;

    }


    room.tasks.push({

        id:
            room.nextTaskId++,

        type:
            "clean",

        x:
            60 +
            Math.random() *
            220,

        y:
            100 +
            Math.random() *
            150

    });

}


function updateTasks(
    room
) {

    for (
        const task of
        room.tasks
    ) {

        /*
        Bots can clean tasks.
        */

        const bot =
            room.bots.find(
                b =>
                    b.task ===
                    "cleaning"
            );


        if (
            bot &&
            distance(
                bot,
                task
            ) <
            25
        ) {

            const index =
                room.tasks.indexOf(
                    task
                );


            if (
                index !==
                -1
            ) {

                room.tasks.splice(
                    index,
                    1
                );

                room.cleanliness =
                    Math.min(
                        100,
                        room.cleanliness +
                        10
                    );

            }

        }

    }

}


/* =========================================================
   GAME LOOP
========================================================= */

setInterval(
    () => {

        for (
            const room of
            rooms.values()
        ) {

            if (
                !room.started
            ) {

                continue;

            }


            updatePlayers(
                room
            );


            updateCustomerPumps(
                room
            );


            updateCustomers(
                room
            );


            updateBots(
                room
            );


            updateTasks(
                room
            );


            /*
            Spawn customers.
            */

            if (
                Math.random() <
                0.015
            ) {

                spawnCustomer(
                    room
                );

            }


            /*
            Random mess.
            */

            if (
                Math.random() <
                0.002
            ) {

                createMess(
                    room
                );

            }


            /*
            Automatic cleanliness decay.
            */

            if (
                Math.random() <
                0.003
            ) {

                room.cleanliness =
                    Math.max(
                        0,
                        room.cleanliness -
                        1
                    );

            }


            /*
            Delivery finished.
            */

            if (
                room.delivery.truckArrived &&
                room.delivery.boxes <=
                0
            ) {

                room.delivery.ordered =
                    false;

                room.delivery.truckArrived =
                    false;

            }

        }

    },

    1000 / 20
);


/* =========================================================
   BROADCAST LOOP
========================================================= */

setInterval(
    () => {

        for (
            const room of
            rooms.values()
        ) {

            if (
                room.started
            ) {

                broadcastState(
                    room
                );

            }

        }

    },

    100
);


/* =========================================================
   DISCONNECT
========================================================= */

io.on(
    "connection",
    socket => {

        socket.on(
            "disconnect",
            () => {

                const room =
                    rooms.get(
                        socket.roomCode
                    );


                if (
                    !room
                ) {

                    return;

                }


                const index =
                    room.players.findIndex(
                        player =>
                            player.id ===
                            socket.id
                    );


                if (
                    index !==
                    -1
                ) {

                    room.players.splice(
                        index,
                        1
                    );

                }


                /*
                If host leaves,
                give host to another player.
                */

                if (
                    room.hostId ===
                    socket.id
                ) {

                    if (
                        room.players.length >
                        0
                    ) {

                        room.hostId =
                            room.players[0].id;

                    }

                    else {

                        rooms.delete(
                            room.code
                        );

                        return;

                    }

                }


                broadcastState(
                    room
                );

            }
        );

    }
);


/* =========================================================
   SERVER
========================================================= */

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Octane server running on port ${PORT}`
        );

    }
);
