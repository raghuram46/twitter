const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "sfakbgjvldkj", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API 1
app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `
        SELECT *
        FROM user
        WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const createUserQuery = `
        INSERT INTO
            user(username, name, password, gender)
        VALUES
            ('${username}', '${name}', '${hashedPassword}', '${gender}');
     `;
    const dbResponse = await db.run(createUserQuery);
    const newUserId = dbResponse.lastID;
    response.send("User created successfully");
  }
});

//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
        SELECT *
        FROM user
        WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "sfakbgjvldkj");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getTweetsQuery = `
     SELECT
        user.username,
        tweet.tweet,
        tweet.date_time AS dateTime 
    FROM tweet INNER JOIN user ON tweet.user_id= user.user_id
    WHERE tweet.user_id IN
        (       
        SELECT following_user_id 
        FROM follower 
        WHERE follower_user_id IN 
        (SELECT user_id FROM user WHERE username ='${username}')
        )
    ORDER BY dateTime DESC
    LIMIT 4
    `;

  const data = await db.all(getTweetsQuery);
  response.send(data);
});

//API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;

  getUserId = `
        SELECT user_id
        FROM user
        WHERE username = '${username}';
    `;
  const userObj = await db.get(getUserId);

  const getQuery = `
         SELECT name
         FROM user
         WHERE user_id IN 
         (SELECT following_user_id FROM follower WHERE follower_user_id = ${userObj.user_id})
        `;
  const result = await db.all(getQuery);
  response.send(result);
});

//API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;

  getUserId = `
        SELECT user_id
        FROM user
        WHERE username = '${username}';
    `;
  const userObj = await db.get(getUserId);

  const getQuery = `
         SELECT name
         FROM user 
         WHERE user_id IN
         (SELECT follower_user_id FROM follower WHERE following_user_id = ${userObj.user_id});
        `;

  const result = await db.all(getQuery);
  response.send(result);
});

//API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const selectQuery = `
        SELECT 
            tweet_id
        FROM
            tweet 
        WHERE user_id IN
            (SELECT following_user_id FROM follower WHERE follower_user_id IN
                (SELECT user_id FROM user WHERE username = '${username}'));
      `;
  const tweetsList = await db.all(selectQuery);

  if (tweetsList.some((each) => each.tweet_id === parseInt(tweetId))) {
    const getTweetQuery = `
                SELECT 
                    tweet.tweet,
                    COUNT(DISTINCT like.like_id) AS likes,
                    COUNT(DISTINCT reply.reply_id) AS replies,
                    tweet.date_time AS dateTime
                FROM (tweet
                    LEFT JOIN like ON tweet.tweet_id = like.tweet_id) AS T
                    LEFT JOIN reply ON T.tweet_id = reply.tweet_id
                WHERE tweet.tweet_id=${tweetId}
            `;
    const data = await db.all(getTweetQuery);
    response.send(data);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const selectQuery = `
        SELECT 
            tweet_id
        FROM
            tweet 
        WHERE user_id IN
            (SELECT following_user_id FROM follower WHERE follower_user_id IN
                (SELECT user_id FROM user WHERE username = '${username}'));
      `;
    const tweetsList = await db.all(selectQuery);

    if (tweetsList.some((each) => each.tweet_id === parseInt(tweetId))) {
      const getLikesQuery = `
                SELECT
                    user.username
                FROM
                    user INNER JOIN like ON user.user_id = like.user_id
                WHERE
                    like.tweet_id=${tweetId};
            `;
      const data = await db.all(getLikesQuery);
      let usersList = [];
      const result = data.forEach((each) => usersList.push(each.username));
      response.send({ likes: usersList });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const selectQuery = `
        SELECT 
            tweet_id
        FROM
            tweet 
        WHERE user_id IN
            (SELECT following_user_id FROM follower WHERE follower_user_id IN
                (SELECT user_id FROM user WHERE username = '${username}'));
      `;
    const tweetsList = await db.all(selectQuery);

    if (tweetsList.some((each) => each.tweet_id === parseInt(tweetId))) {
      const getReplyQuery = `
                SELECT
                    user.name,
                    reply.reply
                FROM
                    user INNER JOIN reply ON user.user_id = reply.user_id
                WHERE
                    reply.tweet_id = ${tweetId};
            `;
      const data = await db.all(getReplyQuery);
      response.send({ replies: data });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserTweetQuery = `
         SELECT 
            tweet.tweet,
            COUNT(DISTINCT like.like_id) AS likes,
            COUNT(DISTINCT reply.reply_id) AS replies,
            tweet.date_time AS dateTime
         FROM (tweet
            LEFT JOIN like ON tweet.tweet_id = like.tweet_id) AS T
            LEFT JOIN reply ON T.tweet_id = reply.tweet_id
         WHERE
            tweet.user_id IN
            (SELECT user_id FROM user WHERE username='${username}')
        `;
  const data = await db.all(getUserTweetQuery);
  response.send(data);
});

//API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const addTweetQuery = `
        INSERT INTO
            tweet (tweet)
        VALUES 
            ('${tweet}')
    `;
  await db.run(addTweetQuery);
  response.send("Created a Tweet");
});

//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserQuery = `
        SELECT 
            user.username
        FROM
            user INNER JOIN tweet ON user.user_id = tweet.user_id
        WHERE
            tweet.tweet_id = ${tweetId};
    `;
    const user = await db.get(getUserQuery);

    if (user.username === username) {
      const deleteTweetQuery = `
                DELETE FROM
                    tweet
                WHERE
                    tweet_id = ${tweetId};
            `;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
