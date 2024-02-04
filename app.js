const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const app = express();
app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const convertStateObjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDistrictObjectToResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

const authenticateWithToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isHashPasswordMatched = await bcrypt.compare(
      password,
      dbUser.password
    );
    if (isHashPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/states/", authenticateWithToken, async (request, response) => {
  const getStatesQuery = `
    SELECT  * FROM state ;`;
  const dbResponse = await db.all(getStatesQuery);
  response.send(
    dbResponse.map((eachState) => convertStateObjectToResponseObject(eachState))
  );
});

app.get(
  "/states/:stateId/",
  authenticateWithToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateQuery = `
     SELECT 
       * 
     FROM 
       state 
    WHERE  
      state_id = ${stateId};`;
    const state = await db.get(getStateQuery);
    response.send(convertStateObjectToResponseObject(state));
  }
);

//GET DISTRICT DETAILS
app.post("/districts/", authenticateWithToken, async (request, response) => {
  const { stateId, districtName, cases, cured, active, deaths } = request.body;
  const addDistrictDetails = `
    INSERT INTO 
    district (state_id, district_name, cases, cured, active, deaths)
    VALUES 
         (
              ${stateId},
             '${districtName}',
              ${cases},
              ${cured},
              ${active},
              ${deaths}
          );`;
  await db.run(addDistrictDetails);
  response.send("District Successfully Added");
});

app.get(
  "/districts/:districtId/",
  authenticateWithToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `
     SELECT 
       *
     FROM 
       district 
     WHERE
       district_id = ${districtId};`;
    const district = await db.get(getDistrictQuery);
    response.send(convertDistrictObjectToResponseObject(district));
  }
);

app.delete(
  "/districts/:districtId/",
  authenticateWithToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
    DELETE FROM
       district
    WHERE 
        district_id = ${districtId};`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authenticateWithToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictDetails = `
    UPDATE district 
    SET  
       district_name ='${districtName}',
       state_id = ${stateId},
       cases = ${cases},
       cured = ${cured},
       active = ${active},
       deaths = ${deaths}
    WHERE district_id = ${districtId};`;
    await db.run(updateDistrictDetails);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authenticateWithToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getDetails = `
   SELECT 
     SUM(cases),
     SUM(cured),
     SUM(active),
     SUM(deaths) 
    FROM 
    district
    WHERE 
      state_id = ${stateId};`;
    const dbResponse = await db.get(getDetails);
    response.send({
      totalCases: dbResponse["SUM(cases)"],
      totalCured: dbResponse["SUM(cured)"],
      totalActive: dbResponse["SUM(active)"],
      totalDeaths: dbResponse["SUM(deaths)"],
    });
  }
);
module.exports = app;
