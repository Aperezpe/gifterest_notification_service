// const serviceAccount = require("./serviceAccountKey.json"); // For local dev only

const admin = require("firebase-admin");
const express = require("express");

const app = express();
const port = process.env.PORT || 3000;

// Initialazes firebase in the app
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID.replace(/\\n/g, "\n"),
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    client_email: process.env.FIREBASE_CLIENT_EMAIL.replace(/\\n/g, "\n"),
  }),
  databaseURL: "https://important-dates-reminders.firebaseio.com",
});
const db = admin.firestore();

// Date variables that are used throughout API
const today = new Date();
const in7Days = new Date(today);
const in30Days = new Date(today);
const in14Days = new Date(today);

in7Days.setDate(in7Days.getDate() + 7);
in14Days.setDate(in14Days.getDate() + 14);
in30Days.setDate(in30Days.getDate() + 30);

today.setHours(0, 0, 0, 0);
in7Days.setHours(0, 0, 0, 0);
in14Days.setHours(0, 0, 0, 0);
in30Days.setHours(0, 0, 0, 0);

// Correct remaining days means if it remains 30,14,7 or 0 days for the event
// to happen DISRIGARDING the year

function hasCorrectRemainingDays(specialEvent, days) {
  const eventDate = new Date(specialEvent.date / 1000);
  eventDate.setHours(0, 0, 0, 0);

  // If event is in following years, then just don't do anything
  if (eventDate.getFullYear() > today.getFullYear()) return;

  if (days == 30) {
    return (
      eventDate.getMonth() == in30Days.getMonth() &&
      eventDate.getDate() == in30Days.getDate()
    );
  } else if (days == 14) {
    return (
      eventDate.getMonth() == in14Days.getMonth() &&
      eventDate.getDate() == in14Days.getDate()
    );
  } else if (days == 7) {
    return (
      eventDate.getMonth() == in7Days.getMonth() &&
      eventDate.getDate() == in7Days.getDate()
    );
  } else if (days == 0) {
    return (
      eventDate.getMonth() == today.getMonth() &&
      eventDate.getDate() == today.getDate()
    );
  }
}
// Object to save users who notifications were sent (for development)
var uids = [];
// Global variables of uid, user, and tokens to save Firestore reads
var uid;
var user;
var tokens = [];
// Sends notification if ramianing days match exactly 30,14,7, or 0
async function sendNotification(specialEvent, days) {
  var isNewUser = false;
  try {
    if (!user) {
      uid = specialEvent.uid;
      user = await db.collection("users").doc(uid).get();
      tokens = user.data().tokens;
      isNewUser = true;
    } else if (uid != specialEvent.uid) {
      uid = specialEvent.uid;
      user = await db.collection("users").doc(uid).get();
      tokens = user.data().tokens;
      isNewUser = true;
    }
    if (tokens) {
      if (isNewUser) uids.push(uid);
      const message = {
        notification: {
          title:
            days == 0
              ? `${specialEvent.friend_name}'s ${specialEvent.event_name} is today!`
              : `${specialEvent.friend_name}'s ${specialEvent.event_name}`,
          body:
            days == 0
              ? "Check out gift ideas!"
              : `${days} days remaining! Check out gift ideas for ${specialEvent.friend_name}`,
        },
        tokens: tokens,
      };
      admin.messaging().sendMulticast(message);
    }
  } catch (e) {
    throw e;
  }
}

app.get("/send_notifications", async (req, res) => {
  if (req.query.activation_key != process.env.HTTP_ACTIVATION_KEY) {
    if (req.query.activation_key == "wake_up") {
      console.log("This function was called to wake up the Heroku Server");
      res.status(200).send("Heroku Servers are awake!!");
      return;
    }

    console.log("The activation key was not correct!!");
    res
      .status(403)
      .send("The client does not have access rights to execute this request");
    return;
  }
  try {
    // Builds Object of Root Special Events from Firebase
    const specialEvents = [];
    const todayMonth = today.getMonth();
    await db
      .collection("root_special_events")
      .where("month", ">=", todayMonth)
      .where("month", "<=", todayMonth + 2)
      .get()
      .then((snapshot) =>
        snapshot.forEach((event) => {
          var obj = event.data();
          obj.id = event.id;
          specialEvents.push(obj);
        })
      );

    // Sort by uid to save in user reads to Firestore
    specialEvents.sort((a, b) => (a.uid > b.uid ? 1 : -1));

    let count = 0;
    for (let event of specialEvents) {
      // Sends notification if the event is Active AND has exactly 30,14,7, or 0 days remianing
      if (
        event.one_time_event == false ||
        event.date >= today.getTime() * 1000 // To get milliseconds and match Unix Milliseconds Epoch format in DB
      ) {
        count++;
        if (hasCorrectRemainingDays(event, 30))
          await sendNotification(event, 30);
        else if (hasCorrectRemainingDays(event, 14))
          await sendNotification(event, 14);
        else if (hasCorrectRemainingDays(event, 7))
          await sendNotification(event, 7);
        else if (hasCorrectRemainingDays(event, 0))
          await sendNotification(event, 0);
      }
    }

    console.log("Notifications successfully sent to the following UIDs:");
    uids.forEach((uid) => console.log(uid));

    res.status(200).send(`Notifications Successfully Sent!!!!`);
  } catch (error) {
    console.log(error);
    res.status(500).send("There was an error getting Firestore data");
  }
});

app.get("/", (req, res) => {
  res.send("API endpoint to send Gifterest notifications");
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
