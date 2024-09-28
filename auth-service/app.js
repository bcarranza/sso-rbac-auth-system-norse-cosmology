import express from "express";
import axios from "axios";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();
const app = express();

const errorHandlingMiddleware = (err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).send(err.message || "Internal server error");
};

app.use(errorHandlingMiddleware);
app.use(express.json());

app.post("/login", async (req, res) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).send("Missing secret header");
  const secret = authHeader.split(" ")[1];

  const { username, password, tenant } = req.body;
  try {
    const { data } = await axios({
      method: "post",
      url: `${process.env.KEYCLOAK_AUTH_SERVER_URL}/realms/${tenant}/protocol/openid-connect/token`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: `grant_type=password&client_id=bifrost&client_secret=${secret}&username=${username}&password=${password}`,
    });
    const { access_token: accessToken, refresh_token: refreshToken } = data;
    res.json({
      accessToken,
      refreshToken,
      ...data,
    });
  } catch (err) {
    console.error(err);
    console.error(`URL: ${process.env.KEYCLOAK_AUTH_SERVER_URL}/realms/${tenant}/protocol/openid-connect/token`)
    console.error(`grant_type=password&client_id=bifrost&client_secret=${secret}&username=${username}&password=${password}`)
    res.status(401).send("Invalid credentials");
  }
});

app.post("/refreshToken", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader) return res.status(401).send("Missing secret header");
    const secret = authHeader.split(" ")[1];

    const { refreshToken, tenant } = req.body;
    const { data } = await axios({
      method: "post",
      url: `${process.env.KEYCLOAK_AUTH_SERVER_URL}/realms/${tenant}/protocol/openid-connect/token`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: `grant_type=refresh_token&client_id=bifrost&client_secret=${secret}&refresh_token=${refreshToken}`,
    });
    console.log({ data });
    const { access_token: accessToken } = data;
    let payload;
    if (accessToken) payload = jwt.decode(accessToken, { complete: true });
    res.json({ accessToken, refreshToken });
  } catch (error) {
    res.status(400).send(error.message);
  }
});

app.get("/verifyToken", async (req, res) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).send("Missing secret header");
    
  const [authType, accessToken] = authHeader.split('|');
  const secret = authType.split(" ")[1];
  if (!secret || !accessToken) return res.status(400).send("Invalid authorization header format");

  const tenant = req.query.tenant;
  if (!tenant) return res.status(400).send("Missing tenant parameter");

  try {
    const { data } = await axios({
      method: "post",
      url: `${process.env.KEYCLOAK_AUTH_SERVER_URL}/realms/${tenant}/protocol/openid-connect/token/introspect`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken}`,
      },
      data: `grant_type=password&client_id=bifrost&client_secret=${secret}&token=${accessToken}`,
    });

    const { active } = data;
    if (!active) throw new Error({ error: "invalid token" });

    res.send(data);
  } catch (error) {
    console.log ("hola, falle en el verify token");
    //console.log (`secret: ${secret}`);
    //console.log (`tenant: ${tenant}`);
    //console.log (`accessToken: ${accessToken}`);
    console.log(`URL: ${process.env.KEYCLOAK_AUTH_SERVER_URL}/realms/${tenant}/protocol/openid-connect/token/introspect`)
    console.log(error.message);
    res.status(401).send(error.message);
  }
});


app.get("/signout", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader) return res.status(401).send("Missing secret header");
    const secret = authHeader.split(" ")[1];

    const refreshToken = req.session.refreshToken;
    const url = `${process.env.KEYCLOAK_AUTH_SERVER_URL}/realms/${tenant}/protocol/openid-connect/revoke`;
    const { data } = await axios({
      method: "post",
      url,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: `client_id=${tenant}&client_secret=bifrost&token=${refreshToken}&token_type_hint=refresh_token`,
    });
    res.send({ data });
  } catch (err) {
    res.status(500).send(`Error logging out: ${err}`);
  }
});

/** ----- admin routes ------- */
app.patch("/suspend", async (req, res) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).send("Missing secret header");
  const secret = authHeader.split(" ")[1];
  
  const userId = req.body.userId;
  const adminToken = req.kauth.grant.access_token.token;
  const userUpdateUrl = `${process.env.KEYCLOAK_AUTH_SERVER_URL}/admin/realms/${tenant}/users/${userId}`;
  try {
    await axios.put(
      userUpdateUrl,
      {
        enabled: false,
      },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    res.send(`User with ID '${userId}' updated successfully.`);
  } catch (error) {
    console.error(`Failed to update user with ID '${userId}':`, error);
  }
});

const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`Auth-service listening on port ${port}`);
});
