import { io } from "socket.io-client";
// import { socketConnectUrl } from '../config/keys';

class SocketManager {
  constructor() {
    // this.socket = io.connect('http://192.168.1.6:3000');
    // this.socket = io.connect('http://3.141.204.62:8002');
    this.socket = io.connect("https://api-fi-erp.fiellements.com");
    // this.socket.on('connect', () => console.log('Connected to server'));
  }

  // <==== Main Room Sockets ====>

  createMainRoom(mainRoom, artistId, isBrowser) {
    this.socket.emit("createMainRoom", mainRoom, artistId, isBrowser);
  }

  alreadyCreateMainRoom(cb) {
    this.socket.on("already-in-main-room", cb);
  }

  ongoLiveRoom(roomName) {
    this.socket.emit("goLiveRoom", roomName);
  }

  onUpdateLiveUserList(cb) {
    this.socket.on("live-update-user-list", cb);
  }
  onUpdategoLive(cb) {
    this.socket.on("updategoLive", cb);
  }

  mainRoomCreated(cb) {
    this.socket.on("main-room-created", cb);
  }
  //<------------------------>

  joinMainRoom(userName, mainRoom) {
    this.socket.emit("join-main-room", { userName, roomName: mainRoom });
  }

  newUserJoinedInMainRoom(cb) {
    this.socket.on("newUserJoined", cb);
  }

  liveStreamStarted(roomName) {
    this.socket.emit("liveStreamStarted", roomName);
  }

  updateUserDisconnected(cb) {
    this.socket.on("update-user-disconnected", cb);
  }

  onUpdatedUserList(cb) {
    this.socket.on("update-user-list", cb);
  }

  onSendEmoji(emjType, roomName) {
    this.socket.emit("emoji-send", { emjType, roomName });
  }

  onSendedEmoji(cb) {
    this.socket.on("sended-emoji", cb);
  }
  //<--------------------------->

  onChangedEvent(status) {
    this.socket.emit('event-changed', {status});
  }

  onArtistDisconnect(roomName) {
    console.log("artist disconnect ", roomName);

    this.socket.emit("artist-disconnect", { roomName });
  }

  onArtistAllDisconnect(cb) {
    console.log("disconnect all artist ");
    this.socket.on("disconnect-all-artist", cb);
  }

  onArtistDisconnected(cb) {
    console.log("artist disconnected ");

    this.socket.on("artist-disconnected", cb);
  }
  // <==== End Of Main Room Sockets ====>

  // <=====Main Room Live Stream Peer Sockets====>

  sendOffer(userId, offer, mainRoom) {
    this.socket.emit("offer", { userId, offer, liveRoom: mainRoom });
  }

  // receviedOffer(cb) {
  //   this.socket.on('offer', cb);
  // }

  // sendAnswer(creatorId, answer) {
  //   this.socket.emit('answer', {creatorId, answer});
  // }

  receviedAnswer(cb) {
    this.socket.on("answer", cb);
  }

  sendIceCandidate(userId, candidate, mainRoom, canType) {
    this.socket.emit("ice-candidate", {
      userId,
      candidate,
      liveRoom: mainRoom,
      canType,
    });
  }

  receviedIceCandidate(cb) {
    this.socket.on("ice-candidate", cb);
  }

  // <=====End Of Main Room Live Stream Peer Sockets====>

  // <==== SubRoom Sockets ====>

  // <------------------>
  onCreateSubRoom(roomName, seatNumber, userId) {
    this.socket.emit("create-sub-room", { roomName, seatNumber, userId });
  }

  onUpdatedSubRoomUserList(cb) {
    this.socket.on("update-sub-room", cb);
  }

  onSubRoomError(cb) {
    this.socket.on("sub-room-error", cb);
  }

  //<----------------------->

  onInviteUserToSubRoom(roomName, userName, userId, seatNumber) {
    this.socket.emit("invite-user-to-sub-room", {
      roomName,
      userName,
      userId,
      seatNumber,
    });
  }

  onSendSubRoomInvitation(cb) {
    this.socket.on("sub-room-invitation", cb);
  }

  onInvitedError(cb) {
    this.socket.on("invited-error", cb);
  }

  //<----------------------->

  onJoinSubRoom(roomName, seatNumber) {
    this.socket.emit("join-sub-room", { roomName, seatNumber });
  }

  onNewUserJoined(cb) {
    this.socket.on("new-user-joined", cb);
  }

  onSubRoomJoinError(cb) {
    this.socket.on("sub-room-not-found", cb);
  }

  //<------------------------>

  onStartStream(
    roomName,
    userId,
    isAudio,
    isVideo,
    isStreamStarted,
    seatNumber
  ) {
    this.socket.emit("start-stream", {
      roomName,
      userId,
      isAudio,
      isVideo,
      isStreamStarted,
      seatNumber,
    });
  }

  onStreamStarted(cb) {
    this.socket.on("stream-started", cb);
  }

  //<----------------------------->

  onToggleVideo(roomName, userId, isVideo, seatNumber) {
    this.socket.emit("toggle-video", {
      roomName,
      userId,
      isVideo,
      seatNumber,
    });
  }

  onToggleVideoMedia(cb) {
    this.socket.on("toggle-video-media", cb);
  }

  //<------------------------------>

  onToggleAudio(roomName, userId, isAudio, seatNumber) {
    this.socket.emit("toggle-audio", { roomName, userId, isAudio, seatNumber });
  }

  onToggleAudioMedia(cb) {
    this.socket.on("toggle-audio-media", cb);
  }

  //<------------------------------->

  onSwitchCamera(roomName, userId, seatNumber) {
    this.socket.emit("switch-camera", { roomName, userId, seatNumber });
  }

  onCameraSwitched(cb) {
    this.socket.on("camera-switched", cb);
  }

  //<-------------------------------->

  onLeaveSubRoom(roomName, userId) {
    this.socket.emit("leave-sub-room", { roomName, userId });
  }

  onUserLeftSubRoom(cb) {
    this.socket.on("user-left-from-subroom", cb);
  }

  onUserLeaved(cb) {
    this.socket.on("user-leaved", cb);
  }

  //<-------------------------------->

  onRemoveFromSubRoom(roomName, userId) {
    this.socket.emit("remove-from-sub-room", { roomName, userId });
  }

  onUserRemovedFromSubRoom(cb) {
    this.socket.on("user-removed-from-sub-room", cb);
  }

  onUserRemoved(cb) {
    this.socket.on("user-removed", cb);
  }

  // <==== End Of SubRoom Sockets ====>

  // <==== SubRoom Peer Connection Sockets ====>

  onSendIceCandidate(candidate, userId) {
    this.socket.emit("send-ice-candidate", { candidate, userId });
  }

  onReceiveIceCandidate(cb) {
    this.socket.on("receive-ice-candidate", cb);
  }

  onSendOffer(offer, joinnerId, senderId, senderSeatNumber) {
    this.socket.emit("send-offer", {
      offer,
      joinnerId,
      senderId,
      senderSeatNumber,
    });
  }

  onReceiveOffer(cb) {
    this.socket.on("receive-offer", cb);
  }

  onSendAnswer(answer, creatorId) {
    this.socket.emit("send-answer", { answer, creatorId });
  }

  onReceiveAnswer(cb) {
    this.socket.on("receive-answer", cb);
  }

  //<====== End Of SubRoom Peer Connection Sockets =====>
}

const socketManager = new SocketManager();

export default socketManager;
