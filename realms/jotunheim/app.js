import express from "express";
import dotenv from "dotenv";
import redis from "ioredis";
dotenv.config();

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
});

redisClient.on("error", (error) => {
  console.error("Redis client error:", error);
});

redisClient.on("end", () => {
  console.log("Redis client connection closed");
});

const app = express();
const errorHandlingMiddleware = (err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).send(err.message || "Internal server error");
};

app.use(async (req, res, next) => {
  const token = req.headers.authorization.split(" ")[1];
  const userDataString = await redisClient.get(token);
  if (userDataString) {
    req.user = JSON.parse(userDataString);
    next();
  } else {
    res.status(401).send("Invalid or expired user key");
  }
});

const authorizationMiddleware = (requiredRole) => {
  return async (req, res, next) => {
    try {
      const availableRoles = req.user.realm_access.roles;
      if (!availableRoles.includes(requiredRole)) throw new Error();
      next();
    } catch (err) {
      res.status(403).send({ error: "access denied" });
    }
  };
};

const characters = [
  { name: "Menglad", location: "jotunheim" },
  { name: "Thjazi", location: "jotunheim" },
  { name: "Angrboda", location: "jotunheim" },
  { name: "Skaði", location: "jotunheim" },
  { name: "Loki", location: "jotunheim" },
  { name: "Fenrir", location: "jotunheim" }
];

app.use(errorHandlingMiddleware);
app.use(express.json());

app.get("/authenticate", (req, res) => {
  //It seems like this is a dummy route, it doesn't; api gateway is validating the token.
  res.send("success");
});

app.get("/authorize", authorizationMiddleware("characters"), (req, res) => {
  res.send("success");
});

app.get("/characters", authorizationMiddleware("characters"), (req, res) => {
  const jotunheimCharacters = characters.filter(character => character.location === "Asgard");
  if (jotunheimCharacters.length >= 5) {
    res.json(jotunheimCharacters);
  } else {
    res.status(404).send("Not enough characters living in jotunheim found.");
  }
});

const port = process.env.PORT || 3002;
app.listen(port, () => {
  console.log(`Jotunheim listening on port ${port}`);
});
