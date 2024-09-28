import express from "express";
import rateLimit from "express-rate-limit";
import axios from "axios";
import { createProxyMiddleware } from "http-proxy-middleware";
import Redis from "ioredis";

// Create a Redis client
const redisClient = new Redis({
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
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests, please try again later.",
});
app.use(apiLimiter);

const authUrl = process.env.AUTH_URL || "http://localhost:3001";

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).send("Missing authorization header");
  const token = authHeader.split(" ")[1];
  
  const tenant = req.query.tenant;
  if (!tenant) return res.status(400).send("Missing tenant parameter");

  
  let cachedData = await redisClient.get(token);
  if (cachedData) {
    console.log("Using cached data");
    return next();
  }
  try {
    console.log("Fetching data from auth service");
    const response = await axios.get(`${authUrl}/verifyToken?tenant=${tenant}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { data } = response;

    //Getting data for authorization later on.
    //apps, modulos, recursos y permisos (adjuntarlo al json de verify)
    // Cual es mi criterio de busqueda en la bd.
    //Criterio de busqueda , sessionid=token and userid.
    
    await redisClient.set(token, JSON.stringify(data));
    next();

  

  } catch (error) {
    console.log({ error });
    console.log(`URL: ${authUrl}/verifyToken?tenant=${tenant}`)
    res.status(401).send("Invalid or expired token");
  }
};

const asgardUrl = process.env.ASGARD_URL || "http://localhost:3002";
const midgardUrl = process.env.MIDGARD_URL || "http://localhost:3002";
const jotunheimUrl = process.env.JOTUNHEIM_URL || "http://localhost:3002";
// Set up proxy middleware for each service

app.use(
  "/api/auth",
  createProxyMiddleware({
    target: authUrl,
    changeOrigin: true,
    pathRewrite: {
      "^/api/auth": "",
    },
    onProxyReq: (proxyReq, req, res) => {
      if (req.method === "POST" && req.headers["content-type"]) {
        proxyReq.setHeader("Content-Type", req.headers["content-type"]);
      }
    },
  })
);

// Asgard Proxy Rules
app.use(
  "/api/asgard",
  authMiddleware,
  createProxyMiddleware({
    target: asgardUrl,
    changeOrigin: true,
    pathRewrite: {
      "^/api/asgard": "",
    },
    onProxyReq: (proxyReq, req, res) => {
      if (req.method === "POST" && req.headers["content-type"]) {
        proxyReq.setHeader("Content-Type", req.headers["content-type"]);
      }
    },
  })
);

// Midgard Proxy Rules
app.use(
  "/api/midgard",
  authMiddleware,
  createProxyMiddleware({
    target: midgardUrl,
    changeOrigin: true,
    pathRewrite: {
      "^/api/midgard": "",
    },
    onProxyReq: (proxyReq, req, res) => {
      if (req.method === "POST" && req.headers["content-type"]) {
        proxyReq.setHeader("Content-Type", req.headers["content-type"]);
      }
    },
  })
);

// Jotunheim Proxy Rules
app.use(
  "/api/jotunheim",
  authMiddleware,
  createProxyMiddleware({
    target: jotunheimUrl,
    changeOrigin: true,
    pathRewrite: {
      "^/api/jotunheim": "",
    },
    onProxyReq: (proxyReq, req, res) => {
      if (req.method === "POST" && req.headers["content-type"]) {
        proxyReq.setHeader("Content-Type", req.headers["content-type"]);
      }
    },
  })
);


const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`API Gateway listening on port ${port}`);
});