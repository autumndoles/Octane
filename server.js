const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

const WORLD = {
    width: 1200,
    height: 700
};

const game = {
    money: 1000,
    fuel: 1000,
    fuelCapacity: 1000,

    storeStock: 100,
    storeCapacity: 100,

    cleanliness: 100,

    day: 1,
    time: 8 * 60,
    speed: 1,

    players: {},
    bots: {},
    customers: {},

    nextBotId: 1,
    nextCustomerId: 1
};

const COLORS = [
    "#ff5555",
    "#55aaff",
    "#55dd88",
    "#ffaa33",
    "#bb66ff",
    "#ff66aa"
];

const BOT_NAMES = [
    "Alex",
    "Sam",
    "Jamie",
    "Riley",
    "Casey",
    "Jordan",
    "Taylor",
    "Morgan"
];

function random(min, max) {
    return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function createBot() {
    const id = `bot-${game.nextBotId++}`;

    game.bots[id] = {
        id,
        name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
        x: random(200, 1000),
        y: random(250, 600),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        job: "idle",
        target: null,
        workTimer: 0
    };

    return game.bots[id];
}

function createCustomer() {
    const id = `customer-${game.nextCustomerId++}`;

    const customer = {
        id,
        x: random(300, 900),
        y: 150,
        targetPump: Math.floor(random(0, 4)),
        state: "arriving",
        waitTime: 0,
        fuelNeeded: random(15, 60),
        shopping: Math.random() < 0.45,
        patience: random(30, 70)
    };

    game.customers[id] = customer;

    return customer;
}

// Start with 2 AI workers.
createBot();
createBot();

function getAllEntities() {
    return {
        players: game.players,
        bots: game.bots,
        customers: game.customers
    };
}

function broadcastState() {
    io.emit("gameState", {
        money: Math.floor(game.money),
        fuel: Math.floor(game.fuel),
        fuelCapacity: game.fuelCapacity,
        storeStock: Math.floor(game.storeStock),
        storeCapacity: game.storeCapacity,
        cleanliness: Math.floor(game.cleanliness),
        day: game.day,
        time: game.time,
        entities: getAllEntities()
    });
}

io.on("connection", socket => {
    console.log("Player connected:", socket.id);

    socket.on("joinGame", name => {
        const playerName =
            typeof name === "string" && name.trim()
                ? name.trim().substring(0, 20)
                : "Player";

        game.players[socket.id] = {
            id: socket.id,
            name: playerName,
            x: 600,
            y: 450,
            color: COLORS[
                Object.keys(game.players).length % COLORS.length
            ],
            job: "idle"
        };

        socket.emit("joined", {
            id: socket.id
        });

        broadcastState();
    });

    socket.on("move", data => {
        const player = game.players[socket.id];

        if (!player) return;

        const speed = 4;

        if (data.up) player.y -= speed;
        if (data.down) player.y += speed;
        if (data.left) player.x -= speed;
        if (data.right) player.x += speed;

        player.x = clamp(player.x, 20, WORLD.width - 20);
        player.y = clamp(player.y, 20, WORLD.height - 20);
    });

    socket.on("setJob", job => {
        const player = game.players[socket.id];

        if (!player) return;

        const validJobs = [
            "idle",
            "fuel",
            "cashier",
            "restock",
            "clean"
        ];

        if (validJobs.includes(job)) {
            player.job = job;
        }
    });

    socket.on("interact", () => {
        const player = game.players[socket.id];

        if (!player) return;

        handlePlayerInteraction(player);
    });

    socket.on("buyUpgrade", upgrade => {
        if (upgrade === "fuelCapacity") {
            if (game.money >= 500) {
                game.money -= 500;
                game.fuelCapacity += 500;
                game.fuel += 500;
            }
        }

        if (upgrade === "storeCapacity") {
            if (game.money >= 400) {
                game.money -= 400;
                game.storeCapacity += 50;
                game.storeStock += 50;
            }
        }

        if (upgrade === "cleanliness") {
            if (game.money >= 300) {
                game.money -= 300;
                game.cleanliness = 100;
            }
        }

        broadcastState();
    });

    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);

        delete game.players[socket.id];

        broadcastState();
    });
});

function distance(a, b) {
    return Math.sqrt(
        Math.pow(a.x - b.x, 2) +
        Math.pow(a.y - b.y, 2)
    );
}

function handlePlayerInteraction(player) {
    // Fuel area
    if (
        player.x > 800 &&
        player.x < 1100 &&
        player.y > 100 &&
        player.y < 300
    ) {
        if (game.fuel > 0) {
            game.fuel -= 10;
            game.money += 25;
            player.job = "fuel";
        }
    }

    // Register
    if (
        player.x > 450 &&
        player.x < 650 &&
        player.y > 100 &&
        player.y < 250
    ) {
        if (game.storeStock > 0) {
            game.storeStock -= 1;
            game.money += 10;
            player.job = "cashier";
        }
    }

    // Restock
    if (
        player.x > 150 &&
        player.x < 350 &&
        player.y > 400 &&
        player.y < 600
    ) {
        if (game.money >= 50 && game.storeStock < game.storeCapacity) {
            game.money -= 50;
            game.storeStock = Math.min(
                game.storeCapacity,
                game.storeStock + 20
            );

            player.job = "restock";
        }
    }

    // Clean
    if (
        player.x > 400 &&
        player.x < 700 &&
        player.y > 500 &&
        player.y < 650
    ) {
        game.cleanliness = Math.min(
            100,
            game.cleanliness + 10
        );

        player.job = "clean";
    }
}

function updateBots() {
    for (const bot of Object.values(game.bots)) {
        if (bot.job === "idle") {
            const jobs = [
                "fuel",
                "cashier",
                "restock",
                "clean"
            ];

            bot.job =
                jobs[Math.floor(Math.random() * jobs.length)];
        }

        bot.workTimer++;

        if (bot.workTimer < 60) continue;

        bot.workTimer = 0;

        if (bot.job === "fuel") {
            if (game.fuel >= 10) {
                game.fuel -= 10;
                game.money += 20;
            }
        }

        if (bot.job === "cashier") {
            if (game.storeStock > 0) {
                game.storeStock--;
                game.money += 8;
            }
        }

        if (bot.job === "restock") {
            if (
                game.money >= 30 &&
                game.storeStock < game.storeCapacity
            ) {
                game.money -= 30;

                game.storeStock = Math.min(
                    game.storeCapacity,
                    game.storeStock + 15
                );
            }
        }

        if (bot.job === "clean") {
            game.cleanliness = Math.min(
                100,
                game.cleanliness + 5
            );
        }

        // Occasionally switch jobs
        if (Math.random() < 0.15) {
            bot.job = "idle";
        }
    }
}

function updateCustomers() {
    for (const customer of Object.values(game.customers)) {
        customer.waitTime++;

        if (customer.state === "arriving") {
            customer.y += 1;

            if (customer.y >= 220) {
                customer.state = "fueling";
            }
        }

        else if (customer.state === "fueling") {
            if (game.fuel >= customer.fuelNeeded) {
                game.fuel -= customer.fuelNeeded;

                game.money +=
                    Math.floor(customer.fuelNeeded * 2);

                customer.state =
                    customer.shopping
                        ? "shopping"
                        : "leaving";
            }
        }

        else if (customer.state === "shopping") {
            if (game.storeStock > 0) {
                game.storeStock--;

                game.money += 10;

                customer.state = "leaving";
            }
        }

        else if (customer.state === "leaving") {
            customer.y -= 2;

            if (customer.y < 50) {
                delete game.customers[customer.id];
            }
        }

        if (customer.waitTime > customer.patience * 10) {
            customer.state = "leaving";
        }
    }

    const customerCount =
        Object.keys(game.customers).length;

    if (
        customerCount < 5 &&
        Math.random() < 0.03
    ) {
        createCustomer();
    }
}

function updateGame() {
    // Time advances
    game.time += 0.2 * game.speed;

    if (game.time >= 24 * 60) {
        game.time = 0;
        game.day++;

        game.money += 100;
    }

    // Station gets dirty slowly
    game.cleanliness = Math.max(
        0,
        game.cleanliness - 0.01
    );

    updateBots();
    updateCustomers();

    broadcastState();
}

setInterval(updateGame, 1000 / 20);

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "index.html")
    );
});

server.listen(PORT, () => {
    console.log(
        `Octane server running at http://localhost:${PORT}`
    );
});
