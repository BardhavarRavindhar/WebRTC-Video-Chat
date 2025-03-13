const express = require("express");
const { Server } = require("socket.io");
const { createServer } = require("http");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs-extra");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const { spawn, exec } = require("child_process");
const fsPromises = require("fs").promises;
const VideoModel = require("./models/Video");
const connectDB = require("./config/db");
const logger = require("./config/logger");
const axios = require("axios");
const { uploadToS3 } = require("./util/s3Upload.js");

const port = 8002;

const app = express();
const server = createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Connect to MongoDB
connectDB();

const io = new Server(server, {
  cors: {
    origin: "*", // Ensure this matches the frontend URL
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Ensure app-level CORS matches the Socket.IO configuration
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  })
);
// Define directories
const UPLOAD_DIR = path.join(__dirname, "uploads");
const CONVERTED_DIR = path.join(__dirname, "converted");
const TEMP_DIR = path.join(__dirname, "temp_chunks");

// Ensure the directories exist
fs.ensureDirSync(UPLOAD_DIR);
fs.ensureDirSync(CONVERTED_DIR);
fs.ensureDirSync(TEMP_DIR);

// Configure multer for file uploads
const storage = multer.memoryStorage(); // Use memory storage for chunks
const upload = multer({ storage });

// app.get("/", (req, res) => {
//   res.send("hello world!");
// });

const resolutions = [
  { width: 1280, height: 720, bitrate: "1500k", name: "720p" },
  { width: 854, height: 480, bitrate: "1000k", name: "480p" },
  { width: 640, height: 360, bitrate: "800k", name: "360p" },
];

// const mainRoom = "main-room";
let mainRoom = [];
let mainUserList = [];
let userInSubRoom = [];
let subRoomNames = [];

//<==== past live array ===>
let pastLiveMainRoom = [];
let pastUserList = [];
let userInPastSubRoom = [];
let pastSubRoomNames = [];
let initialAllUserSocket = [];

io.on("connection", (socket) => {
  console.log("a new client connected", socket.id);

  // initialAllUserSocket.push({ initialId: socket.id });

  socket.on("init-connect", (userId) => {
    const existingUser = initialAllUserSocket.find(
      (user) => user.userId === userId && user.initialId !== socket.id
    );
    if (existingUser) {
      existingUser.initialId = socket.id;
      console.log("init-existingUser", initialAllUserSocket.length);
    } else {
      initialAllUserSocket.push({
        initialId: socket.id,
        userId,
        liveCreator: false,
      });
      console.log("init-connect", initialAllUserSocket.length);
    }

    console.log("init-connect", initialAllUserSocket);

    if (mainUserList && mainUserList.length > 0) {
      mainUserList.forEach((user) => {
        io.to(user.userSocketId).emit("init-list", initialAllUserSocket);
      });
    }

    // Emit the updated list to all users
    initialAllUserSocket.forEach((user) => {
      io.to(user.initialId).emit("init-list", initialAllUserSocket);
    });

    // Emit the list to the newly connected user
    socket.to(socket.id).emit("init-list", initialAllUserSocket);
  });
  // <------------------>
  // socket.on("createMainRoom", (roomName) => {
  //   mainRoom.push({ mainRoom: roomName, creatorSocketId: socket.id });
  //   socket.join(roomName);
  //   socket.emit("main-room-created", { roomName });
  //   console.log(`Main Room created ${roomName}`);
  // });

  socket.on("createMainRoom", (roomName, artistId, isBrowser) => {
    // Find if the room already exists for the given artist
    const existingRoom = mainRoom.find(
      (room) => room.mainRoom === roomName && room.artistId === artistId
    );

    if (!isBrowser) {
      console.log("Native side handling...");

      if (existingRoom) {
        // If the room exists and the creatorSocketId is different, update the socket IDs
        if (existingRoom.creatorSocketId !== socket.id) {
          existingRoom.creatorSocketId = socket.id;
          existingRoom.nativeSocketId = socket.id;
          socket.join(roomName);
          socket.emit("main-room-created", { roomName, artistId });
          socket.emit("already-in-main-room", {
            roomName,
            creatorSocketId: socket.id,
          });
          console.log(`Already in Main Room: ${roomName}`);
        } else {
          socket.join(roomName);
          socket.emit("main-room-created", { roomName, artistId });
        }
      } else {
        // If the room doesn't exist, create a new one
        mainRoom.push({
          mainRoom: roomName,
          creatorSocketId: socket.id,
          nativeSocketId: socket.id,
          browserSocketId: null,
          artistId,
        });

        const initialSockets = initialAllUserSocket.find(
          (soc) => soc.userId === artistId
        );

        if (initialSockets) {
          initialSockets.liveCreator = true;
        }

        socket.join(roomName);
        socket.emit("main-room-created", { roomName, artistId });
        console.log(`Main Room created: ${roomName}`);
      }

      console.log("Updated mainRoom (Native side):", mainRoom);
    } else {
      console.log("Browser side handling...");

      if (existingRoom) {
        // If the room exists, join it and update the browserSocketId
        socket.join(existingRoom.mainRoom);
        existingRoom.browserSocketId = socket.id;
        if (mainUserList && mainUserList.length > 0) {
          mainUserList.forEach((user) => {
            if (user.mainRoom === existingRoom.mainRoom) {
              console.log("browserside  mainuserlist first");
              user.mainRoomCreatorId = socket.id;
            }
          });
          mainUserList.forEach((user) => {
            if (user.mainRoom === existingRoom.mainRoom) {
              console.log("browserside  mainUserList ");
              const updatedUserList = mainUserList.filter(
                (user) => user.mainRoom === roomName
              );
              io.to(user.userSocketId).emit(
                "update-user-list",
                updatedUserList
              );
            }
          });
        }

        // existingRoom.creatorSocketId = socket.id;
        socket.emit("main-room-created", { roomName, artistId });
        // socket.emit("update-user-list", mainUserList);
        console.log(`Joined existing Main Room: ${roomName} (Browser side)`);
      } else {
        // Handle the case where the room should be created from the browser side (if needed)
        console.log(`Room does not exist for browser side: ${roomName}`);
      }

      console.log("Updated mainRoom (Browser side):", mainRoom);
    }
  });

  socket.on("emoji-send", ({ emjType, roomName }) => {
    console.log("emjType", emjType, roomName);

    const userData = mainRoom.find((user) => user.mainRoom === roomName);
    console.log("userData", userData);

    if (userData) {
      console.log("inside", userData);
      io.to(userData.creatorSocketId).emit("sended-emoji", {
        emjType,
        roomName,
      });
    }
  });

  socket.on("goLiveRoom", (roomName, isAudio, isFlip) => {
    const existingRoom = mainRoom.find(
      (room) => room.mainRoom === roomName && room.creatorSocketId === socket.id
    );
    if (existingRoom) {
      const updatedUserList = mainUserList.filter(
        (user) => user.mainRoom === roomName
      );
      io.to(roomName).emit("update-user-list", updatedUserList);
      if (updatedUserList && updatedUserList.length > 0) {
        socket.emit("updategoLive", {
          createrId: socket.id,
          mainRoom: roomName,
          userList: updatedUserList,
          isAudio,
          isFlip,
        });
      }
    }
  });

  socket.on("liveStreamStarted", (roomName) => {
    console.log(" liveStreamStarted ", roomName, "socket id ", socket.id);

    if (roomName) {
      console.log(" inside if live stream ", socket.id);

      const mainRoomData = mainRoom.find((room) => room.mainRoom === roomName);
      if (mainRoomData.mainRoom) {
        console.log(
          " inside if live stream  if again ",
          mainRoomData.browserSocketId
        );
        const isBefore = true;
        const updatedUserList = mainUserList.filter(
          (user) => user.mainRoom === roomName
        );
        io.to(mainRoomData.browserSocketId).emit(
          "live-update-user-list",
          updatedUserList,
          isBefore
        );
      }
    }
  });

  socket.on("backPressOnLive", ({ liveRoom }) => {
    const isExitsMainRoom = mainRoom.find((r) => r.mainRoom === liveRoom);

    if (isExitsMainRoom) {
      io.to(isExitsMainRoom.browserSocketId).emit(
        "onBackPressArtist",
        "backPressed"
      );
    }
  });
  // <-------------------->

  // when a user joins with a name
  socket.on("join-main-room", ({ userName, roomName, partId }) => {
    // Join the main room
    // <------------------->

    const mainRoomData = mainRoom.find((room) => room.mainRoom === roomName);

    if (mainRoomData.mainRoom && mainRoomData.creatorSocketId) {
      // Check if the user is already in the room
      const existingUser = mainUserList.find(
        (user) => user.partId === partId && user.userSocketId !== socket.id
      );

      if (existingUser) {
        console.log("User already exists in the room");

        existingUser.userSocketId = socket.id;

        socket.join(roomName);

        console.log("main user list after update", mainUserList.length);

        // io.to(mainRoomData.creatorSocketId).emit("newUserJoined", socket.id);
        io.to(mainRoomData.browserSocketId).emit("newUserJoined", socket.id);

        const updatedUserList = mainUserList.filter(
          (user) => user.mainRoom === roomName
        );

        // io.to(roomName).emit("init-list", initialAllUserSocket);
        io.to(mainRoomData.nativeSocketId).emit(
          "update-user-list",
          updatedUserList
        );

        // Broadcast updated mainUserList to all users in the mainRoom
        io.to(roomName).emit("update-user-list", updatedUserList);
        io.to(mainRoomData.browserSocketId).emit(
          "update-user-list",
          updatedUserList
        );
      } else {
        socket.join(roomName);
        console.log(`${userName} (${socket.id}) joined the main room`);

        console.log("main user list before", mainUserList);
        // Add user to the mainUserList
        mainUserList.push({
          mainRoom: roomName,
          userName: userName,
          partId,
          userSocketId: socket.id,
          mainRoomCreatorId: mainRoomData.browserSocketId,
          mainRoomNativeeCreatorId: mainRoomData.nativeSocketId,
          inSubRoom: null,
        });

        console.log("main user list after update", mainUserList.length);

        // io.to(mainRoomData.creatorSocketId).emit("newUserJoined", socket.id);
        io.to(mainRoomData.browserSocketId).emit("newUserJoined", socket.id);

        const updatedUserList = mainUserList.filter(
          (user) => user.mainRoom === roomName
        );

        // io.to(roomName).emit("init-list", initialAllUserSocket);

        // Broadcast updated mainUserList to all users in the mainRoom
        io.to(roomName).emit("update-user-list", updatedUserList);
        io.to(mainRoomData.browserSocketId).emit(
          "update-user-list",
          updatedUserList
        );
      }
    } else {
      console.log("Room does not exist");
    }
    //<-------------------->
  });

  socket.on("create-sub-room", ({ roomName, seatNumber, userId }) => {
    // Check if the room name already exists

    if (isExitsSubRoom(roomName) === true) {
      // Notify the user that the room already exists
      socket.emit(
        "sub-room-error",
        "Room name already exists. Please choose another name."
      );
      return;
    }

    const user = mainUserList.find((user) => user.userSocketId === userId);

    // Add the room name to the array
    subRoomNames.push({ subRoom: roomName, mainRoom: user.mainRoom });

    // Find the user's name from the mainUserList

    if (user) {
      // Join the sub-room
      user.inSubRoom = roomName;
      socket.join(roomName);

      // Add user to sub-room list and mark them as the creator
      userInSubRoom.push({
        roomName: roomName,
        userName: user.userName, // Add userName to the sub-room list
        mainRoom: user.mainRoom,
        userSocketId: socket.id,
        seatNumber: seatNumber,
        isCreator: true, // Mark this user as the creator of the room
        isVideo: false,
        isAudio: false,
        isStreamStarted: false,
      });

      io.to(roomName).emit("update-sub-room", {
        subRoomList: getUsersInSubRoom(roomName),
        roomName,
      });
      const updatedUserList = mainUserList.filter(
        (u) => u.mainRoom === user.mainRoom
      );
      io.to(user.mainRoom).emit("update-user-list", updatedUserList);
      mainUserList.forEach((user) => {
        io.to(user.userSocketId).emit("init-list", initialAllUserSocket);
      });
    }
  });

  socket.on("invite-user-to-sub-room", (data) => {
    const {
      roomName,
      userName,
      userId,
      seatNumber,
      tcType,
      eventTime,
      scheduleDate,
      mainLiveRoom,
      host,
      contentId,
      browserId,
      nativeId,
    } = data;
    const isExits = initialAllUserSocket.find(
      (user) => user.initialId === userId
    );
    const senderData = mainUserList.find(
      (user) => user.userSocketId === socket.id
    );
    if (isExits) {
      io.to(userId).emit("sub-room-invitation", {
        roomName,
        from: socket.id,
        seatNumber,
        senderName: senderData.userName,
        tcType,
        eventTime,
        scheduleDate,
        mainRoom: mainLiveRoom,
        host,
        contentId,
        browserId,
        nativeId,
      });
    } else {
      socket.emit("invited-error", "User not found!");
    }
  });

  socket.on(
    "join-sub-room",
    ({ roomName, seatNumber, liveRoom, browserId, nativeId, userName }) => {
      const mainRoomData = mainRoom.find((room) => room.mainRoom === liveRoom);
      if (isExitsSubRoom(roomName) && mainRoomData) {
        const isInMainRoom = mainUserList.some(
          (user) =>
            user.userSocketId === socket.id && user.mainRoom === liveRoom
        );

        if (isInMainRoom) {
          const userData = mainUserList.find(
            (user) => user.userSocketId === socket.id
          );
          userInSubRoom.push({
            roomName: roomName,
            userName: userData.userName, // Add userName to the sub-room list
            mainRoom: userData.mainRoom,
            userSocketId: socket.id,
            seatNumber: seatNumber,
            isCreator: false,
            isVideo: false,
            isAudio: false,
            isStreamStarted: false,
          });
          userData.inSubRoom = roomName;
          socket.join(roomName);

          userInSubRoom.forEach((user) => {
            if (user.userSocketId !== socket.id && user.roomName === roomName) {
              io.to(user.userSocketId).emit("new-user-joined", {
                joinnerId: socket.id,
                senderSeatNumber: user.seatNumber,
                senderId: user.userSocketId,
              });
            }
          });
          io.to(roomName).emit("update-sub-room", {
            subRoomList: getUsersInSubRoom(roomName),
            roomName,
          });
          const updatedUserList = mainUserList.filter(
            (user) => user.mainRoom === liveRoom
          );
          io.to(userData.mainRoom).emit("update-user-list", updatedUserList);
          mainUserList.forEach((user) => {
            io.to(user.userSocketId).emit("init-list", initialAllUserSocket);
          });
        } else {
          socket.join(liveRoom);
          socket.join(roomName);
          console.log(`${userName} (${socket.id}) joined the main room`);

          console.log("main user list before", mainUserList);
          // Add user to the mainUserList
          mainUserList.push({
            mainRoom: liveRoom,
            userName: userName,
            userSocketId: socket.id,
            mainRoomCreatorId: browserId,
            mainRoomNativeeCreatorId: nativeId,
            inSubRoom: liveRoom,
          });

          userInSubRoom.push({
            roomName: roomName,
            userName: userName,
            mainRoom: liveRoom,
            userSocketId: socket.id,
            seatNumber: seatNumber,
            isCreator: false,
            isVideo: false,
            isAudio: false,
            isStreamStarted: false,
          });

          io.to(browserId).emit("newUserJoined", socket.id);
          const updatedUserList = mainUserList.filter(
            (user) => user.mainRoom === liveRoom
          );
          io.to(liveRoom).emit("update-user-list", updatedUserList);
          io.to(browserId).emit("update-user-list", updatedUserList);

          userInSubRoom.forEach((user) => {
            if (user.userSocketId !== socket.id && user.roomName === roomName) {
              io.to(user.userSocketId).emit("new-user-joined", {
                joinnerId: socket.id,
                senderSeatNumber: user.seatNumber,
                senderId: user.userSocketId,
              });
            }
          });

          io.to(roomName).emit("update-sub-room", {
            subRoomList: getUsersInSubRoom(roomName),
            roomName,
          });
          mainUserList.forEach((user) => {
            io.to(user.userSocketId).emit("init-list", initialAllUserSocket);
          });
        }
      } else {
        socket.emit("sub-room-not-found", "Sub-room not found!");
      }
    }
  );

  socket.on("on-host-leave-sub-room", (data) => {
    if (isExitsSubRoom(data.roomName)) {
      const subRoomUsers = userInSubRoom.filter(
        (user) => user.roomName === data.roomName
      );

      const hostMainRoom = userInSubRoom.find(
        (u) => u.userSocketId === data.userId
      );

      userInSubRoom = userInSubRoom.filter(
        (user) => user.roomName !== data.roomName
      );

      mainUserList = mainUserList.filter(
        (user) => user.mainRoom !== hostMainRoom.mainRoom
      );

      subRoomUsers.forEach((user) => {
        socket.leave(user.roomName);
      });

      subRoomUsers.forEach((user) => {
        socket.leave(hostMainRoom.mainRoom);
      });

      subRoomUsers.forEach((user) => {
        io.to(user.userSocketId).emit("remove-all-users-from-subRoom", {
          msg: "leaved",
        });
      });

      const updatedUserList = mainUserList.filter(
        (user) => user.mainRoom === hostMainRoom.mainRoom
      );

      io.to(hostMainRoom.mainRoom).emit("update-user-list", updatedUserList);

      socket.emit("update-sub-room", {
        subRoomList: [],
        roomName: "",
      });
    }
  });

  // leave room function
  socket.on("leave-sub-room", (data) => {
    if (isExitsSubRoom(data.roomName)) {
      userInSubRoom = userInSubRoom.filter(
        (user) => user.userSocketId !== data.userId
      );

      const mainUser = mainUserList.find(
        (user) => user.userSocketId === data.userId
      );

      mainUserList = mainUserList.filter(
        (user) => user.userSocketId !== data.userId
      );

      socket.leave(data.roomName);
      socket.leave(mainUser.mainRoom);

      userInSubRoom.forEach((user) => {
        if (
          user.userSocketId !== data.userId &&
          user.roomName === data.roomName
        ) {
          io.to(user.userSocketId).emit("user-left-from-subroom", {
            userId: data.userId,
          });
          io.to(user.userSocketId).emit("update-sub-room", {
            subRoomList: getUsersInSubRoom(data.roomName),
            roomName: data.roomName,
          });
        }
      });

      io.to(data.userId).emit("user-leaved", { userId: data.userId });

      io.to(data.userId).emit("remove-all-users-from-subRoom", {
        msg: "leaved",
      });

      const updatedUserList = mainUserList.filter(
        (user) => user.mainRoom === mainUser.mainRoom
      );

      io.to(mainUser.mainRoom).emit("update-user-list", updatedUserList);

      socket.emit("update-sub-room", {
        subRoomList: [],
        roomName: "",
      });
    }
  });

  // Remove room function
  socket.on("remove-from-sub-room", (data) => {
    if (isExitsSubRoom(data.roomName)) {
      userInSubRoom = userInSubRoom.filter(
        (user) => user.userSocketId !== data.userId
      );

      const mainUser = mainUserList.find(
        (user) => user.userSocketId === data.userId
      );

      mainUserList = mainUserList.filter(
        (user) => user.userSocketId !== data.userId
      );

      io.sockets.sockets.get(data.userId).leave(data.roomName);
      io.sockets.sockets.get(data.userId).leave(mainUser.mainRoom);

      userInSubRoom.forEach((user) => {
        if (
          user.userSocketId !== data.userId &&
          user.roomName === data.roomName
        ) {
          io.to(user.userSocketId).emit("user-removed-from-sub-room", {
            userId: data.userId,
            removedBy: socket.id,
          });
          io.to(user.userSocketId).emit("update-sub-room", {
            subRoomList: getUsersInSubRoom(data.roomName),
            roomName: data.roomName,
          });
        }
      });

      io.to(data.userId).emit("remove-all-users-from-subRoom", {
        msg: "leaved",
      });

      // Notify the user that they've been removed
      io.sockets.sockets.get(data.userId).emit("user-removed", {
        removedBy: socket.id,
        userId: data.userId,
      });

      io.sockets.sockets.get(data.userId).emit("update-sub-room", {
        subRoomList: [],
        roomName: "",
      });

      const updatedUserList = mainUserList.filter(
        (user) => user.mainRoom === mainUser.mainRoom
      );

      io.to(mainUser.mainRoom).emit("update-user-list", updatedUserList);
    }
  });

  socket.on("start-stream", (data) => {
    if (isExitsSubRoom(data.roomName)) {
      const user = isExitsUserInSubRoom(
        data.userId,
        data.seatNumber,
        data.roomName
      );
      if (user) {
        (user.isStreamStarted = data.isStreamStarted),
          (user.isVideo = data.isVideo),
          (user.isAudio = data.isAudio);
        io.to(data.roomName).emit("update-sub-room", {
          subRoomList: getUsersInSubRoom(data.roomName),
          roomName: data.roomName,
        });
        io.to(data.userId).emit("stream-started", {
          isStreamStarted: data.isStreamStarted,
          isVideo: data.isVideo,
          isAudio: data.isAudio,
        });
      }
    }
  });

  socket.on("toggle-video", ({ roomName, userId, isVideo, seatNumber }) => {
    if (isExitsSubRoom(roomName)) {
      const user = isExitsUserInSubRoom(userId, seatNumber, roomName);
      if (user) {
        user.isVideo = isVideo;
        io.to(roomName).emit("update-sub-room", {
          subRoomList: getUsersInSubRoom(roomName),
          roomName,
        });
        io.to(userId).emit("toggle-video-media", {
          isVideo,
        });
      }
    }
  });

  socket.on("toggle-audio", ({ roomName, userId, isAudio, seatNumber }) => {
    if (isExitsSubRoom(roomName)) {
      const user = isExitsUserInSubRoom(userId, seatNumber, roomName);
      if (user) {
        user.isAudio = isAudio;
        io.to(roomName).emit("update-sub-room", {
          subRoomList: getUsersInSubRoom(roomName),
          roomName,
        });
        io.to(userId).emit("toggle-audio-media", {
          isAudio,
        });
      }
    }
  });

  socket.on("switch-camera", (data) => {
    if (isExitsSubRoom(data.roomName)) {
      const user = isExitsUserInSubRoom(
        data.userId,
        data.seatNumber,
        data.roomName
      );
      if (user) {
        io.to(data.userId).emit("camera-switched");
      }
    }
  });

  // SubRoom Video Calling pairing

  socket.on("send-offer", (data) => {
    const isInMainRoom = mainRoom.some(
      (room) => room.mainRoom === data.liveRoom
    );

    console.log("isInMainRoom", isInMainRoom);

    if (isInMainRoom) {
      console.log("isInMainRoom iff", isInMainRoom);
      const isInSubRoom = subRoomNames.some(
        (room) =>
          room.mainRoom === data.liveRoom && room.subRoom === data.subRoom
      );
      console.log("isInSubRoom", isInSubRoom);
      if (isInSubRoom) {
        console.log("isInSubRoom iff", isInSubRoom);
        const joinUser = userInSubRoom.some(
          (u) =>
            u.userSocketId === data.joinnerId &&
            u.roomName === data.subRoom &&
            u.mainRoom === data.liveRoom
        );
        console.log("joinUser", joinUser);
        const sendUser = userInSubRoom.some(
          (u) =>
            u.userSocketId === data.senderId &&
            u.roomName === data.subRoom &&
            u.mainRoom === data.liveRoom
        );
        console.log("sendUser", sendUser);
        if (joinUser && sendUser) {
          console.log("sendUser and joinUser iff", sendUser, joinUser);
          socket.to(data.joinnerId).emit("receive-offer", {
            creatorId: socket.id,
            offer: data.offer,
            senderSeatNumber: data.senderSeatNumber,
            senderId: data.senderId,
            subRoom: data.subRoom,
            liveRoom: data.liveRoom,
          });
        }
      }
    }
  });

  socket.on("send-answer", (data) => {
    const isInMainRoom = mainRoom.some(
      (room) => room.mainRoom === data.liveRoom
    );

    console.log("isInMainRoom", isInMainRoom);

    if (isInMainRoom) {
      console.log("isInMainRoom iff", isInMainRoom);
      const isInSubRoom = subRoomNames.some(
        (room) =>
          room.mainRoom === data.liveRoom && room.subRoom === data.subRoom
      );
      console.log("isInSubRoom", isInSubRoom);

      if (isInSubRoom) {
        console.log("isInSubRoom iff", isInSubRoom);

        const createUser = userInSubRoom.some(
          (u) =>
            u.userSocketId === data.creatorId &&
            u.roomName === data.subRoom &&
            u.mainRoom === data.liveRoom
        );
        console.log("createUser", createUser);
        if (createUser) {
          console.log("createUser iff", createUser);
          socket.to(data.creatorId).emit("receive-answer", {
            userId: socket.id,
            answer: data.answer,
            liveRoom: data.liveRoom,
            subRoom: data.subRoom,
          });
        }
      }
    }
  });

  socket.on("send-ice-candidate", (data) => {
    const isInMainRoom = mainRoom.some(
      (room) => room.mainRoom === data.liveRoom
    );

    console.log("isInMainRoom", isInMainRoom);

    if (isInMainRoom) {
      console.log("isInMainRoom iff", isInMainRoom);
      const isInSubRoom = subRoomNames.some(
        (room) =>
          room.mainRoom === data.liveRoom && room.subRoom === data.subRoom
      );
      console.log("isInSubRoom", isInSubRoom);

      if (isInSubRoom) {
        console.log("isInSubRoom iff", isInSubRoom);

        const currentUser = userInSubRoom.some(
          (u) =>
            u.userSocketId === data.userId &&
            u.roomName === data.subRoom &&
            u.mainRoom === data.liveRoom
        );
        console.log("currentUser", currentUser);
        if (currentUser) {
          socket.to(data.userId).emit("receive-ice-candidate", {
            senderId: socket.id,
            candidate: data.candidate,
            liveRoom: data.liveRoom,
            subRoom: data.subRoom,
          });
        }
      }
    }
  });

  //live stream pairing
  socket.on("ice-candidate", (data) => {
    if (data.canType === "artist") {
      const isInMainRoom = mainUserList.some(
        (user) =>
          user.mainRoom === data.liveRoom && user.userSocketId === data.userId
      );

      if (isInMainRoom) {
        socket
          .to(data.userId)
          .emit("ice-candidate", socket.id, data.candidate, data.liveRoom);
      }
    } else if (data.canType === "partType") {
      const isExitArtist = mainRoom.some(
        (artist) =>
          artist.mainRoom === data.liveRoom &&
          artist.browserSocketId === data.userId
      );

      if (isExitArtist) {
        socket
          .to(data.userId)
          .emit("ice-candidate", socket.id, data.candidate, data.liveRoom);
      }
    }
  });

  socket.on("offer", (data) => {
    const isInMainRoom = mainUserList.some(
      (user) =>
        user.mainRoom === data.liveRoom && user.userSocketId === data.userId
    );

    if (isInMainRoom) {
      logger.info(`offer info ${JSON.stringify(data)}`);
      socket
        .to(data.userId)
        .emit("offer", socket.id, data.offer, data.liveRoom);
    }
  });

  socket.on("answer", (data) => {
    // doubt ha abhi
    const isExitArtist = mainRoom.some(
      (artist) =>
        artist.mainRoom === data.liveRoom &&
        artist.browserSocketId === data.creatorId
    );
    if (isExitArtist) {
      logger.info(`answer info ${JSON.stringify(data)}`);
      socket
        .to(data.creatorId)
        .emit("answer", socket.id, data.answer, data.liveRoom);
    }
  });

  socket.on("artist-disconnect", (data) => {
    console.log("IF---", data);

    if (isExitsMainRoom(data.roomName)) {
      console.log("INSIDE IF---", data);
      console.log("main room ", mainRoom);

      const artistData = mainRoom.find(
        (u) => u.mainRoom === data.roomName && u.browserSocketId === socket.id
      );

      console.log("artistData", artistData);

      if (artistData) {
        console.log("artistData  ifff", artistData);
        const allSocket = initialAllUserSocket.find(
          (i) => i.initialId === artistData.nativeSocketId
        );
        console.log("allSocket", allSocket);
        if (allSocket) {
          console.log("allSocket  ifff", allSocket);
          allSocket.liveCreator = false;
        }
      }

      const mainList = mainUserList.filter(
        (user) => user.mainRoom === data.roomName
      );

      const subList = userInSubRoom.filter(
        (user) => user.mainRoom === data.roomName
      );

      mainUserList = mainUserList.filter(
        (user) => user.mainRoom !== data.roomName
      );

      userInSubRoom = userInSubRoom.filter(
        (user) => user.mainRoom !== data.roomName
      );

      subRoomNames = subRoomNames.filter(
        (user) => user.mainRoom !== data.roomName
      );

      const userBrowser = mainRoom.find(
        (room) => room.mainRoom === data.roomName
      );

      mainRoom = mainRoom.filter((room) => room.mainRoom !== data.roomName);

      console.log("mainUserList", mainUserList);
      console.log("subRoomUserList", userInSubRoom);
      console.log("mainRoom Name", mainRoom);
      console.log("subRoom Name", subRoomNames);

      subList.forEach((user) => {
        if (user.mainRoom === data.roomName) {
          io.sockets.sockets.get(user.userSocketId).leave(user.roomName);
        }
      });

      mainList.forEach((user) => {
        if (user.mainRoom === data.roomName) {
          io.sockets.sockets.get(user.userSocketId).leave(data.roomName);
        }
      });

      socket.leave(data.roomName);

      mainList.forEach((user) => {
        if (user.mainRoom === data.roomName) {
          io.to(user.userSocketId).emit("update-sub-room", {
            subRoomList: [],
            roomName: "",
          });
          io.to(user.userSocketId).emit("update-user-list", []);
          io.to(user.userSocketId).emit(
            "artist-disconnected",
            "disconnected successfully!!"
          );
        }
      });

      initialAllUserSocket.forEach((u) =>
        io.to(u.initialId).emit("init-list", initialAllUserSocket)
      );

      io.to(userBrowser.nativeSocketId).emit("update-user-list", []);
      socket.emit("update-user-list", []);

      // mainRoom = mainRoom.filter(
      //   (user) => user.mainRoom !== data.roomName
      // );

      // removeMainRoom(data.roomName);

      io.to(userBrowser.browserSocketId).emit(
        "artist-disconnected",
        "disconnected successfully!!"
      );

      io.to(userBrowser.nativeSocketId).emit(
        "artist-disconnected",
        "disconnected successfully!!"
      );

      // io.sockets.sockets.get(socket.id).leave(data.roomName);
      // io.to(data.roomName).emit("artist-disconnected");
      // io.to(userBrowser.nativeSocketId).emit("disconnect-all-artist");
      // io.to(userBrowser.nativeSocketId).emit("native-side-listen");
      // io.to(data.roomName).emit("update-user-list", mainUserList);
    }
  });

  // <======= Past Live sockets ======>

  socket.on("past-send-offer", (data) => {
    const senderInRoom = userInPastSubRoom.some(
      (u) => u.roomName === data.subRoom && u.userSocketId === data.senderId
    );
    const joinnerInRoom = userInPastSubRoom.some(
      (u) => u.roomName === data.subRoom && u.userSocketId === data.joinnerId
    );

    if (senderInRoom && joinnerInRoom) {
      socket.to(data.joinnerId).emit("past-receive-offer", {
        creatorId: socket.id,
        offer: data.offer,
        senderId: data.senderId,
        subRoom: data.subRoom,
        senderSeatNumber: data.senderSeatNumber,
      });
    }
  });

  socket.on("past-send-answer", (data) => {
    const creatorInRoom = userInPastSubRoom.some(
      (u) => u.roomName === data.subRoom && u.userSocketId === data.creatorId
    );

    if (creatorInRoom) {
      socket.to(data.creatorId).emit("past-receive-answer", {
        userId: socket.id,
        answer: data.answer,
        subRoom: data.subRoom,
      });
    }
  });

  socket.on("past-send-ice-candidate", (data) => {
    const userInRoom = userInPastSubRoom.some(
      (u) => u.roomName === data.subRoom && u.userSocketId === data.userId
    );

    if (userInRoom) {
      socket.to(data.userId).emit("past-receive-ice-candidate", {
        senderId: socket.id,
        candidate: data.candidate,
        subRoom: data.subRoom,
      });
    }
  });

  // <-----Past Main Room ----->

  // <----- create past sub room ---->
  socket.on(
    "create-past-sub-room",
    ({ userName, roomName, seatNumber, roomCreatorId }) => {
      userInPastSubRoom.push({
        roomName: roomName,
        creatorSocketId: socket.id,
        userSocketId: socket.id,
        roomCreatorId: roomCreatorId,
        userName: userName,
        seatNumber: seatNumber,
        isCreator: true,
        isVideo: false,
        isAudio: false,
        isStreamStarted: false,
      });
      socket.join(roomName);
      socket.emit("invited-past-list", { initialAllUserSocket });
      console.log(`Past Main Room created ${roomName}`);
      io.to(roomName).emit("past-update-sub-room", {
        pastSubRoomList: getUsersInPastSubRoom(roomName),
        roomName,
      });
    }
  );

  // <---- invite past sub room ---->
  socket.on("invite-past-sub-room", (data) => {
    const { roomName, userId, seatNumber, stream, ticketType } = data;
    const senderData = userInPastSubRoom.find(
      (user) => user.userSocketId === socket.id && user.roomName === roomName
    );

    if (senderData) {
      io.to(userId).emit("past-sub-room-invitation", {
        roomName,
        from: socket.id,
        seatNumber,
        senderName: senderData.userName,
        stream,
        roomCreatorUserId: senderData.roomCreatorId,
        roomCreatorSocketId: senderData.creatorSocketId,
        ticketType,
      });
    }
  });

  //<---- join past sub room----->
  socket.on(
    "join-past-sub-room",
    ({
      roomName,
      seatNumber,
      userName,
      roomCreatorUserId,
      roomCreatorSocketId,
    }) => {
      const roomCreatorUser = userInPastSubRoom.find(
        (user) =>
          user.userSocketId === roomCreatorSocketId &&
          user.roomName === roomName &&
          user.isCreator === true &&
          user.roomCreatorId === roomCreatorUserId
      );

      if (roomCreatorUser) {
        userInPastSubRoom.push({
          roomName: roomName,
          creatorSocketId: roomCreatorSocketId,
          userSocketId: socket.id,
          roomCreatorId: roomCreatorUserId,
          userName: userName,
          seatNumber: seatNumber,
          isCreator: false, // Mark this user as the creator of the room
          isVideo: false,
          isAudio: false,
          isStreamStarted: false,
        });

        socket.join(roomName);

        userInPastSubRoom.forEach((user) => {
          if (user.userSocketId !== socket.id && user.roomName === roomName) {
            io.to(user.userSocketId).emit("new-user-joined-past-sub-room", {
              joinnerId: socket.id,
              senderSeatNumber: user.seatNumber,
              senderId: user.userSocketId,
            });
          }
        });
        io.to(roomName).emit("past-update-sub-room", {
          pastSubRoomList: getUsersInPastSubRoom(roomName),
          roomName,
        });
      } else {
        socket.emit("past-sub-room-not-found", "Sub-room not found!");
      }
    }
  );

  // leave from past sub room function
  socket.on("leave-past-sub-room", (data) => {
    const userData = userInPastSubRoom.find(
      (user) =>
        user.userSocketId === data.userId && user.roomName === data.roomName
    );

    if (userData) {
      if (userData.isCreator) {
        const pastRoomData = userInPastSubRoom.filter(
          (user) => user.roomName === data.roomName
        );

        userInPastSubRoom = userInPastSubRoom.filter(
          (user) => user.roomName !== data.roomName
        );

        pastRoomData.forEach((room) => {
          if (room.roomName === data.roomName) {
            socket.leave(data.roomName);
          }
        });

        //peerconnection remaining
        pastRoomData.forEach((user) => {
          if (user.roomName === data.roomName) {
            // io.to(user.userSocketId).emit("user-left-from-past-subroom", {
            //   userId: user.userSocketId,
            //   userName: user.userName,
            // });
            io.to(user.userSocketId).emit("host-leave-sub-room", "hostLeave");
            io.to(user.userSocketId).emit("past-update-sub-room", {
              pastSubRoomList: [],
              roomName: "",
            });
          }
        });
      } else {
        userInPastSubRoom = userInPastSubRoom.filter(
          (user) => user.userSocketId !== data.userId
        );

        socket.leave(data.roomName);

        //peer connection remaining
        userInPastSubRoom.forEach((user) => {
          if (
            user.userSocketId !== data.userId &&
            user.roomName === data.roomName
          ) {
            io.to(user.userSocketId).emit("user-left-from-past-subroom", {
              userId: data.userId,
              userName: userData.userName,
            });
            io.to(user.userSocketId).emit("past-update-sub-room", {
              pastSubRoomList: getUsersInPastSubRoom(data.roomName),
              roomName: data.roomName,
            });
          }
        });

        io.to(data.userId).emit("user-leaved-past-subroom", {
          userId: data.userId,
          userName: userData.userName,
        });
      }
    }

    // if (isExitsPastSubRoom(data.roomName)) {
    //   const userData = userInPastSubRoom.find(
    //     (user) => user.userSocketId === data.userId
    //   );

    //   if (userData.isCreator) {
    //     userInPastSubRoom.forEach((user) => {
    //       if (user.roomName === data.roomName) {
    //         socket.leave(data.roomName);
    //       }
    //     });
    //     userInPastSubRoom.forEach((user) => {
    //       if (user.roomName === data.roomName) {
    //         io.to(user.userSocketId).emit("past-update-sub-room", {
    //           pastSubRoomList: [],
    //           roomName: "",
    //         });
    //       }
    //     });

    //     userInPastSubRoom.forEach((user) => {
    //       if (
    //         user.roomName === data.roomName &&
    //         user.userSocketId !== data.userId
    //       ) {
    //         io.to(user.userSocketId).emit("host-leave-sub-room", "hostLeave");
    //       }
    //     });

    //     userInPastSubRoom = userInPastSubRoom.filter(
    //       (user) => user.roomName !== data.roomName
    //     );
    //   } else {
    //     userInPastSubRoom = userInPastSubRoom.filter(
    //       (user) => user.userSocketId !== data.userId
    //     );

    //     // const mainUser = pastUserList.find(
    //     //   (user) => user.userSocketId === data.userId
    //     // );

    //     // if (mainUser) {
    //     //   mainUser.inSubRoom = null;
    //     // }
    //     socket.leave(data.roomName);

    //     userInPastSubRoom.forEach((user) => {
    //       if (
    //         user.userSocketId !== data.userId &&
    //         user.roomName === data.roomName
    //       ) {
    //         io.to(user.userSocketId).emit("user-left-from-past-subroom", {
    //           userId: data.userId,
    //           userName: userData.userName,
    //         });
    //         io.to(user.userSocketId).emit("past-update-sub-room", {
    //           pastSubRoomList: getUsersInPastSubRoom(data.roomName),
    //           roomName: data.roomName,
    //         });
    //       }
    //     });

    //     io.to(data.userId).emit("user-leaved-past-subroom", {
    //       userId: data.userId,
    //       userName: userData.userName,
    //     });

    //     // io.to(mainUser.pastRoom).emit("past-update-user-list", pastUserList);

    //     socket.emit("past-update-sub-room", {
    //       pastSubRoomList: [],
    //       roomName: "",
    //     });
    //   }
    // }
  });

  // Remove from past sub room function
  socket.on("remove-from-past-sub-room", (data) => {
    const userData = userInPastSubRoom.find(
      (user) =>
        user.userSocketId === data.userId && user.roomName === data.roomName
    );

    if (userData) {
      const userRemoved = userInPastSubRoom.find(
        (user) => user.userSocketId === data.userId
      );
      const userRemovedBy = userInPastSubRoom.find(
        (user) => user.userSocketId === socket.id
      );
      userInPastSubRoom = userInPastSubRoom.filter(
        (user) => user.userSocketId !== data.userId
      );

      io.sockets.sockets.get(data.userId).leave(data.roomName);

      userInPastSubRoom.forEach((user) => {
        if (
          user.userSocketId !== data.userId &&
          user.roomName === data.roomName
        ) {
          io.to(user.userSocketId).emit("user-removed-from-past-sub-room", {
            userId: data.userId,
            removedBy: socket.id,
            userRemove: userRemoved.userName,
            removedByUser: userRemovedBy.userName,
          });
          io.to(user.userSocketId).emit("past-update-sub-room", {
            pastSubRoomList: getUsersInPastSubRoom(data.roomName),
            roomName: data.roomName,
          });
        }
      });

      io.sockets.sockets.get(data.userId).emit("user-removed-past-subroom", {
        removedBy: socket.id,
        userId: data.userId,
        removedByUser: userRemovedBy.userName,
      });

      io.sockets.sockets.get(data.userId).emit("past-update-sub-room", {
        pastSubRoomList: [],
        roomName: "",
      });
    }
  });

  socket.on("start-stream-past", (data) => {
    // if (isExitsPastSubRoom(data.roomName)) {
    const user = isExitsUserInPastSubRoom(
      data.userId,
      data.seatNumber,
      data.roomName
    );
    if (user) {
      (user.isStreamStarted = data.isStreamStarted),
        (user.isVideo = data.isVideo),
        (user.isAudio = data.isAudio);
      io.to(data.roomName).emit("past-update-sub-room", {
        pastSubRoomList: getUsersInPastSubRoom(data.roomName),
        roomName: data.roomName,
      });
      io.to(data.userId).emit("stream-started-past", {
        isStreamStarted: data.isStreamStarted,
        isVideo: data.isVideo,
        isAudio: data.isAudio,
      });
    }
    // }
  });

  socket.on(
    "toggle-video-past",
    ({ roomName, userId, isVideo, seatNumber }) => {
      if (isExitsPastSubRoom(roomName)) {
        const user = isExitsUserInPastSubRoom(userId, seatNumber, roomName);
        if (user) {
          user.isVideo = isVideo;
          io.to(roomName).emit("past-update-sub-room", {
            pastSubRoomList: getUsersInPastSubRoom(roomName),
            roomName: roomName,
          });
          io.to(userId).emit("toggle-video-media-past", {
            isVideo,
          });
        }
      }
    }
  );

  socket.on(
    "toggle-audio-past",
    ({ roomName, userId, isAudio, seatNumber }) => {
      // if (isExitsPastSubRoom(roomName)) {
      const user = isExitsUserInPastSubRoom(userId, seatNumber, roomName);
      if (user) {
        user.isAudio = isAudio;
        io.to(roomName).emit("past-update-sub-room", {
          pastSubRoomList: getUsersInPastSubRoom(roomName),
          roomName: roomName,
        });
        io.to(userId).emit("toggle-audio-media-past", {
          isAudio,
        });
      }
    }
    // }
  );

  socket.on("switch-camera-past", (data) => {
    if (isExitsPastSubRoom(data.roomName)) {
      const user = isExitsUserInPastSubRoom(
        data.userId,
        data.seatNumber,
        data.roomName
      );
      if (user) {
        io.to(data.userId).emit("camera-switched-past");
      }
    }
  });

  socket.on("onback-pressed", ({ roomName, userId }) => {
    console.log("onback-pressed ", roomName, userId);

    if (isExitsMainRoom(roomName)) {
      const existingRoom = mainUserList.find(
        (room) => room.mainRoom === roomName && room.userSocketId === userId
      );
      if (existingRoom) {
        const isSubRoom = userInSubRoom.find(
          (user) => user.userSocketId === userId
        );

        if (isSubRoom) {
          userInSubRoom = userInSubRoom.filter(
            (user) => user.userSocketId !== userId
          );
        }

        mainUserList = mainUserList.filter(
          (user) => user.userSocketId !== userId
        );

        if (isSubRoom) {
          socket.leave(isSubRoom.roomName);
        }
        socket.leave(roomName);

        if (isSubRoom) {
          io.to(isSubRoom.roomName).emit("update-sub-room", {
            subRoomList: getUsersInSubRoom(isSubRoom.roomName),
            roomName: isSubRoom.roomName,
          });
        }

        const userBrowser = mainRoom.find((room) => room.mainRoom === roomName);
        console.log("kdfhsduifghsdfjgdsfhdg---->", userBrowser);
        const updatedUserList = mainUserList.filter(
          (user) => user.mainRoom === roomName
        );
        io.to(roomName).emit("update-user-list", updatedUserList);
        io.to(userBrowser.nativeSocketId).emit(
          "update-user-list",
          updatedUserList
        );
        io.to(userBrowser.browserSocketId).emit(
          "update-user-list",
          updatedUserList
        );
        // io.to(userBrowser.browserSocketId).emit("update-user-disconnected", userId);
        // io.to(userBrowser.nativeSocketId).emit("update-user-disconnected", userBrowser.browserSocketId, userBrowser.nativeSocketId );
      }
    }
  });

  socket.on("event-changed", ({ status }) => {
    console.log("status event changed initialAllUserSocket ", status);
    initialAllUserSocket.forEach((user) => {
      console.log("user initialAllUserSocket ", user);
      io.to(user.initialId).emit("eventchanged", { status });
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected with socket ID:", socket.id);

    // Debugging: Check the current state of user lists before filtering
    console.log("Before filtering, mainUserList:", mainUserList);
    console.log("Before filtering, userInSubRoom:", userInSubRoom);
    console.log(
      "Before filtering, initialAllUserSocket:",
      initialAllUserSocket
    );

    // Find if the disconnected user is in the main room
    const isInMainRoom = mainUserList.find(
      (user) => user.userSocketId === socket.id
    );

    // Find if the disconnected user is in a sub-room
    const isInSubRoom = userInSubRoom.find(
      (user) => user.userSocketId === socket.id
    );

    // Remove user from sub-room if present
    if (isInSubRoom) {
      console.log("User found in sub-room:", isInSubRoom);
      userInSubRoom = userInSubRoom.filter(
        (user) => user.userSocketId !== socket.id
      );

      // Emit the updated sub-room list to the sub-room
      io.to(isInSubRoom.roomName).emit("update-sub-room", {
        subRoomList: getUsersInSubRoom(isInSubRoom.roomName),
        roomName: isInSubRoom.roomName,
      });
    } else {
      console.log("User not found in sub-room.");
    }

    // Remove user from main user list if present
    if (isInMainRoom) {
      console.log("User found in main room:", isInMainRoom);
      mainUserList = mainUserList.filter(
        (user) => user.userSocketId !== socket.id
      );

      const updatedUserList = mainUserList.filter(
        (user) => user.mainRoom === isInMainRoom.mainRoom
      );
      // Emit the updated main room list to all users in the main room
      io.to(isInMainRoom.mainRoom).emit("update-user-list", updatedUserList);

      if (isInMainRoom.mainRoomCreatorId) {
        io.to(isInMainRoom.mainRoomCreatorId).emit(
          "update-user-list",
          updatedUserList
        );
      }

      // If there's a specific user identified by mainRoomNativeeCreatorId, update them as well
      if (isInMainRoom.mainRoomNativeeCreatorId) {
        io.to(isInMainRoom.mainRoomNativeeCreatorId).emit(
          "update-user-list",
          updatedUserList
        );
      }
    } else {
      console.log("User not found in main room.");
    }

    // Update the initial all user socket list and emit to all users
    const initialLength = initialAllUserSocket.length;
    initialAllUserSocket = initialAllUserSocket.filter(
      (initi) => initi.initialId !== socket.id
    );

    // Check if filtering was successful
    if (initialAllUserSocket.length < initialLength) {
      console.log("User removed from initialAllUserSocket.");
    } else {
      console.log("User not found in initialAllUserSocket.");
    }

    initialAllUserSocket.forEach((user) =>
      io.to(user.initialId).emit("init-list", initialAllUserSocket)
    );

    // Debugging: Check the state of user lists after filtering
    console.log("After filtering, mainUserList:", mainUserList);
    console.log("After filtering, userInSubRoom:", userInSubRoom);
    console.log("After filtering, initialAllUserSocket:", initialAllUserSocket);

    console.log("Disconnect from main_room:", mainRoom);
  });
});

// Remove the main room if it exists
function removeMainRoom(roomName) {
  const index = mainRoom.findIndex((user) => user.mainRoom === roomName);
  if (index !== -1) {
    mainRoom.splice(index, 1);
  }
}

function isExitsMainRoom(roomName) {
  return mainRoom.some((user) => user.mainRoom === roomName);
}
function getUsersInSubRoom(roomName) {
  return userInSubRoom.filter((user) => user.roomName === roomName);
}

function getUsersInPastSubRoom(roomName) {
  return userInPastSubRoom.filter((user) => user.roomName === roomName);
}

function isExitsSubRoom(roomName) {
  const isExits = subRoomNames.some((user) => user.subRoom === roomName);
  return isExits;
}

function isExitsPastSubRoom(roomName) {
  const isExits = pastSubRoomNames.some(
    (user) => user.pastSubRoom === roomName
  );
  return isExits;
}

function isExitsUserInSubRoom(userId, seatNumber, roomName) {
  return userInSubRoom.find(
    (user) =>
      user.userSocketId === userId &&
      user.seatNumber === seatNumber &&
      user.roomName === roomName
  );
}

function isExitsUserInPastSubRoom(userId, seatNumber, roomName) {
  return userInPastSubRoom.find(
    (user) =>
      user.userSocketId === userId &&
      user.seatNumber === seatNumber &&
      user.roomName === roomName
  );
}

// Helper function to get video metadata using fluent-ffmpeg
async function getVideoMetadata(chunkPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(chunkPath, (error, metadata) => {
      if (error) {
        console.error(`Error getting metadata for ${chunkPath}:`, error);
        reject(error);
      } else {
        try {
          // Metadata is already in JSON format, so no need to parse it
          resolve(metadata);
        } catch (parseError) {
          console.error('Failed to extract FFmpeg metadata:', parseError);
          reject(parseError);
        }
      }
    });
  });
}

// Extract format details from the metadata (resolution, codec, etc.)
function extractFormatFromMetadata(metadata) {
  const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
  if (videoStream) {
    const format = {
      codec: videoStream.codec_name,
      resolution: `${videoStream.width}x${videoStream.height}`,
      bitrate: videoStream.bit_rate,
    };
    return format;
  }
  return null;
}

// Main function to validate chunks format
async function validateChunksFormat(chunkPath) {
  let format = null;
  let valid = true;
  console.log("<======= #### validateChunksFormat started #### =====>", chunkPath);

  try {
    const metadata = await getVideoMetadata(chunkPath);

    if (!metadata) {
      throw new Error(`Failed to retrieve metadata for ${chunkPath}`);
    }

    const videoFormat = extractFormatFromMetadata(metadata);

    if (!format) {
      format = videoFormat;
      console.log(`Chunk ${chunkPath} has format: ${JSON.stringify(videoFormat)}`);
    } else if (JSON.stringify(format) !== JSON.stringify(videoFormat)) {
      console.log(`Chunk ${chunkPath} has a different format.`);
      valid = false;
    }
  } catch (error) {
    console.error(`Error validating chunk format for ${chunkPath}:`, error);
    valid = false;
  }

  if (valid) {
    console.log("All chunks have the same format");
  }
  return valid;
}


// Store chunk as a file with a unique name
async function storeChunk(filename, chunkIndex, chunkBuffer) {
  const chunkId = `${filename}_chunk${chunkIndex}`;
  const filePath = path.join(TEMP_DIR, chunkId);
  console.log("storeChunk", chunkId, filePath);
  await fsPromises.writeFile(filePath, chunkBuffer);
}

// Retrieve chunk from file
async function getChunk(filename, chunkIndex) {
  const chunkId = `${filename}_chunk${chunkIndex}`;
  const filePath = path.join(TEMP_DIR, chunkId);

  try {
    let isValid = await validateChunksFormat(filePath);
    console.log("is Valid validateChunksFormat", isValid);
    if (!isValid) {
      return
    }
    console.log("getChunk", chunkId, filePath);

    return await fsPromises.readFile(filePath);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

// Remove chunk file
async function removeChunk(filename, chunkIndex) {
  const chunkId = `${filename}_chunk${chunkIndex}`;
  const filePath = path.join(TEMP_DIR, chunkId);
  try {
    console.log("removeChunk", chunkId, filePath);
    await fsPromises.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

// API route for chunk upload
app.post("/api/upload-chunk", upload.single("file"), async (req, res) => {
  const { filename, chunkIndex } = req.body;

  // console.log("upload chunk api ", filename);

  if (!req.file || !filename || chunkIndex === undefined) {
    return res.status(400).json({ success: false, message: "Invalid request" });
  }

  try {
    await storeChunk(filename, chunkIndex, req.file.buffer);
    console.log(
      `Chunk ${chunkIndex} uploaded and stored as a file for ${filename}`
    );
    res
      .status(200)
      .json({ success: true, message: "Chunk uploaded successfully" });
  } catch (err) {
    // console.error('Error storing chunk:', err);
    res.status(500).json({ success: false, message: "Error storing chunk" });
  }
});

const videoProcess = async (
  filename,
  contentId,
  backendUrl,
  baseUrl,
  mergedFilePath
) => {
  try {
    console.log("merged file path ", mergedFilePath);
    logger.info(
      `videoprocess: ${filename}, backendurl: ${backendUrl}, contentId: ${contentId}, baseurl: ${baseUrl}`
    );

    const outputPath = path.join(CONVERTED_DIR, `${Date.now()}.mp4`);
    const ffmpegProcess = spawn("ffmpeg", ["-i", mergedFilePath, "-vf", "hflip", outputPath]);

    console.log("ffmpeg process spawned");

    ffmpegProcess.on("error", (err) => {
      // logger.error("Error spawning ffmpeg process:", err.message);
      fs.unlinkSync(mergedFilePath); // Clean up merged file on error
    });

    ffmpegProcess.on("close", async (code) => {
      if (code === 0) {
        fs.unlinkSync(mergedFilePath); // Clean up merged file after successful conversion

        try {
          const lastSlashIndex = outputPath.lastIndexOf(path.sep);
          const partAfterLastSlash = outputPath.substring(lastSlashIndex + 1);

          logger.info("Part after last /:", partAfterLastSlash);

          const s3Key = `${filename}-${Date.now()}.mp4`;
          // const s3Url = `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${s3Key}`;
          const s3Url = `https://example.s3.amazonaws.com/${s3Key}`;

          // Upload converted video to S3
          uploadToS3(outputPath, s3Key, async (err, data) => {
            if (err) {
              logger.error("Error uploading video to S3:", err.message);
              fs.unlinkSync(outputPath); // Clean up the local converted file on error
            } else {
              try {
                console.log("s3url upload response", data);

                // Update video info in the database only after successful S3 upload
                let updateVideoUrl = await VideoModel.updateOne(
                  { contentId: contentId, filename },
                  {
                    $set: {
                      path: `/converted/${partAfterLastSlash}`,
                      url: s3Url,
                      status: "completed",
                    },
                  }
                );

                console.log(
                  "contentId Update video status with final URL ",
                  updateVideoUrl,
                  contentId
                );

                // Update video status with final URL via API call
                const updateVideoStatus = await axios.put(
                  `${backendUrl}/content/updateVideoStatus?id=${contentId}`,
                  {
                    videoStatus: "Complete",
                    videoUrl: s3Url,
                  }
                );
                console.log(
                  "Response: updateVideoStatus final",
                  updateVideoStatus.status
                );

                logger.info(
                  "File converted, uploaded to S3, and database updated successfully."
                );

                // Clean up the local converted file after uploading to S3
                fs.unlinkSync(outputPath);
              } catch (dbErr) {
                logger.error(
                  "Error updating video information in the database:",
                  dbErr.message
                );
                fs.unlinkSync(outputPath); // Ensure cleanup of the local converted file if an error occurs
              }
            }
          });
        } catch (err) {
          logger.error(
            "Error during S3 upload or video processing:",
            err.message
          );
          fs.unlinkSync(outputPath); // Ensure cleanup of the local converted file if an error occurs
        }
      } else {
        fs.unlinkSync(mergedFilePath); // Clean up merged file if ffmpeg fails
        logger.error("ffmpeg process exited with code:", code);
        // Update video info in the database with failed status
        await VideoModel.updateOne(
          { contentId, filename },
          {
            $set: {
              status: "failed",
            },
          }
        );
      }
    });

    ffmpegProcess.stderr.on("data", (data) => {
      logger.error(`ffmpeg stderr: ${data}`);
    });
  } catch (err) {
    logger.error("Error in video processing:", err.message);
  }
};

app.post("/api/merge-and-convert", async (req, res) => {
  const { filename, totalChunks, userId, contentId } = req.body;
  logger.info(
    `Merge and convert API called with filename: ${filename}, totalChunks: ${totalChunks} and conentId ${contentId}`
  );
  try {
    let baseUrl = "https://api.example.com";
    let backendUrl = "http://3.1.1.62:4001/v1";
    if (!filename || !totalChunks || !contentId) {
      logger.error(
        `Invalid request parameters, filename: ${filename}, totalChunks: ${totalChunks}, contentId: ${contentId} , userId: ${userId}`
      );
      return res
        .status(400)
        .json({ success: false, message: "Invalid request" });
    }

    const eventStatus = await axios.put(
      `${backendUrl}/content/updateContentStatus?id=${contentId}&eventStatus=End`
    );
    console.log("eventStatus ", eventStatus.status);

    if (eventStatus.status) {
      const filePaths = [];

      for (let i = 1; i <= totalChunks; i++) {
        const chunkBuffer = await getChunk(filename, i);

        if (chunkBuffer) {
          const chunkPath = path.join(UPLOAD_DIR, `${filename}.part${i}`);
          fs.writeFileSync(chunkPath, chunkBuffer);
          filePaths.push(chunkPath);
          await removeChunk(filename, i); // Remove chunk after writing
        } else {
          logger.warn(`Chunk ${i} missing for ${filename}`);
          await removeChunk(filename, i);
        }
      }

      if (filePaths.length === 0) {
        logger.warn("No valid chunks to merge.");
        return res
          .status(400)
          .json({ success: false, message: "No valid chunks to merge" });
      }





      const mergedFilePath = path.join(UPLOAD_DIR, `${filename}.merged`);
      fs.writeFileSync(mergedFilePath, "");

      // Merge chunks
      for (const filePath of filePaths) {
        const data = fs.readFileSync(filePath);
        fs.appendFileSync(mergedFilePath, data);
        fs.unlinkSync(filePath); // Clean up individual chunk files after merging
      }

      logger.info(
        `Chunks merged. Converting to MP4: ${mergedFilePath} and ${contentId}`
      );

      const updateVideoStatusInprocess = await VideoModel.create({
        filename: filename,
        userId: userId,
        contentId: contentId,
        status: "Inprocess",
      });

      if (!updateVideoStatusInprocess) {
        return res
          .status(400)
          .json({ success: false, message: "create video model failed" });
      }
      const updateVideoStatus = await axios.put(
        `${backendUrl}/content/updateVideoStatus?id=${contentId}`,
        {
          videoStatus: "Inprocess",
        }
      );
      console.log("Response: updateVideoStatus", updateVideoStatus.status);
      if (updateVideoStatus.status) {
        logger.info("Video status updated to Inprocess.&&&&");

        videoProcess(filename, contentId, backendUrl, baseUrl, mergedFilePath);
        // videoProcessWithResolutions(filename, contentId, backendUrl, baseUrl, mergedFilePath, resolutions);
        // Send response immediately
        return res.status(200).json({
          success: true,
          message: "Chunks merged successfully. Conversion in progress.",
        });
      } else {
        return res
          .status(400)
          .json({ success: false, message: "update video status failed!!!" });
      }
    } else {
      console.log("error eventStatus ", eventStatus.status);
      return res
        .status(400)
        .json({ success: false, message: "event status update failed" });
    }
  } catch (error) {
    console.log("main merge convertion url ", error);
  }
});

// API route to fetch all merged videos
app.get("/api/videos", (req, res) => {
  fs.readdir(CONVERTED_DIR, (err, files) => {
    if (err) {
      return res
        .status(500)
        .json({ success: false, message: "Error fetching videos" });
    }
    const videoFiles = files.filter((file) => file.endsWith(".mp4"));
    res.status(200).json({ success: true, videos: videoFiles });
  });
});

app.get("/api/all-past-live", async (req, res) => {
  try {
    const videos = await VideoModel.find().populate("userId", "username"); // Adjust based on your user schema
    res.status(200).json({ success: true, videos: videos });
  } catch (err) {
    console.error("Error fetching videos:", err);
    res.status(500).json({ success: false, message: "Error fetching videos" });
  }
});

app.post("/api/past-live-by-user", async (req, res) => {
  try {
    const { userId } = req.body;
    if (userId) {
      const videos = await VideoModel.find({ userId: userId }); // Adjust based on your user schema
      res.status(200).json({ success: true, videos: videos });
    } else {
      res
        .status(200)
        .json({ success: false, message: "No past live available" });
    }
  } catch (err) {
    console.error("Error fetching videos:", err);
    res.status(500).json({ success: false, message: "Error fetching videos" });
  }
});

// Serve static files from the converted directory
app.use("/converted", express.static(CONVERTED_DIR));

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});


