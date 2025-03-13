import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./MediaRecord.css";
import socketManager from "../socketManager/SocketManager";
import useWebRTC from "../WebrtcConnection/useWebrtc.js";
import axios from "axios";
import Micon from "../assets/Micon";
import MicOff from "../assets/MicOff";
import SwitchCamera from "../assets/SwitchCamera";
import { thirdPartServerUrl } from "../config/keys";

// const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB chunks
// const RECORDING_DURATION = 60 * 10000; // 1 minute

// Create an Axios instance
const noBaseUrlInstance = axios.create({
  headers: {
    "Content-Type": "application/json",
  },
});

const token = "4/k6/wZRVVRPP7t+njFT3ldHWYh9Aohf0BNbnm5jRr7oNkrNg1aMFTbB59WfTmiatvHQNZZDv/U2JX4WhelEo4F8xfYug+ljPkjS/utunDcF5o0++v6CwfEwnm/OqrHLOzIk+7wnbZgdK6o3ZWs01dhf3eWJWsAZUGF6OHG2h//uEfcx2YgFfQbn7UwhfILZfzPb/b8GOhM8Ggm/8suYtLXJd1z7ESFjyPyVhBmv5bDHS1AoWuOl2H8gRHcc4lHHIYe6i5iDtVBc3dWTURpPRyolO1tRzb2Rg8L3Sp+I6kg0Up8F/x6J0lWP8Eo8V6YyV4ks4G0zGTj2shTEVuuNwwxvVV/L7tdqEJXGshgE7PvEu65zhK+QjrPWrYBro3/6m1WrM3TXqb1ZMWB98RUP+0iCqaLlnZK57iOuU42FUMryNNm3yH0LmPNAEkVZ7b4HKpTljk+5OCl7L/5x2hqAnyN/gWmPz867Ym1ee6UCbSxlpuc="

// Interceptor to prepend the base URL and manage headers
noBaseUrlInstance.interceptors.request.use((config) => {
  config.url = thirdPartServerUrl + config.url;
  config.headers = {
    ...config.headers,
  };
  return config;
});

const MediaRecord = () => {
  const [recording, setRecording] = useState(false);
  const [facingMode, setFacingMode] = useState("user");
  const [userList, setUserList] = useState([]);
  const [previousSended, setPreviousSended] = useState([]);
  const [mute, setMute] = useState(true);
  const [localStream, setLocalStream] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const localVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const totalChunksRef = useRef(0);
  const chunkIndexRef = useRef(1);
  const stopUploadRef = useRef(false);
  const streamRef = useRef(null);
  const { artistId, contentId, mainroomname } = useParams();
  const navigate = useNavigate();
  const filenameRef = useRef(
    `recording_${Math.random().toString(36).substring(2, 15)}`
  ); // Generate a unique filename only once

  const {
    handleSignalingData,
    createPeerConnectionCreator,
    toggleAudio,
    switchCamera,
  } = useWebRTC();

  console.log(totalChunksRef?.current,chunkIndexRef.current, " hhhhhhhhhhh ");
  console.log( " uploaded file", uploadedFile);

  const handleJoinedRoom = useCallback(
    async (userId) => {
      console.log("artistId handleJoinedRoom ", artistId, " userId ", userId);
      if (localStream && mainroomname) {
        // stream required
        console.log("streamRef ", localStream);
        await createPeerConnectionCreator(localStream, userId, mainroomname);
      }
    },
    [artistId, createPeerConnectionCreator, localStream, mainroomname]
  );

  const handleReceviedAnswer = useCallback(
    async (userId, answer, liveRoom) => {
      if (mainroomname && liveRoom && mainroomname === liveRoom) {
        await handleSignalingData({
          userId,
          answer,
          type: "answer",
        });
      }
    },
    [handleSignalingData, mainroomname]
  );

  const handleReceviedCandidate = useCallback(
    async (userId, candidate, liveRoom) => {
      if (mainroomname && liveRoom && mainroomname === liveRoom) {
        await handleSignalingData({
          userId,
          candidate,
          type: "icecandidate",
        });
      }
    },
    [handleSignalingData, mainroomname]
  );

  const handlegoLiveOffer = useCallback(
    async (data) => {
      if (data.userList.length > 0) {
        data.userList.forEach(async (user) => {
          if (
            user.mainRoom === data.mainRoom &&
            data.createrId !== user.userSocketId
          ) {
            await createPeerConnectionCreator(
              localStream, // stream required
              user.userSocketId,
              mainroomname
            );
          }
        });
      }
    },
    [createPeerConnectionCreator, localStream, mainroomname]
  );

  const handleAudio = useCallback(() => {
    console.log("handle audio localStream ", localStream, " oo ", mute);
    if (localStream) {
      console.log("audio----");
      toggleAudio(!mute, localStream);
      setMute((prevMute) => !prevMute);
    } else {
      console.log(" mute else [[[[[[[ ", mute);
    }
  }, [localStream, mute, toggleAudio]);

  const handleSwitchCamera = useCallback(() => {
    console.log("handleSwitch camera ", localStream, " uuuu ", facingMode);
    // if(localStream) {
    //   switchCamera(localStream);
    //   // alert("working fine");
    // }
    if (localStream) {
      console.log("switch ");

      switchCamera(localStream);
      setFacingMode((prevMode) =>
        prevMode === "user" ? "environment" : "user"
      );
    } else {
      console.log("No stream available for switching");
    }
    console.log("========");
  }, [localStream, facingMode, switchCamera]);

  const handleUserUpdateList = useCallback((mainUserList) => {
    console.log("main user list ", mainUserList);
    // setUserList(mainUserList)
  }, []);

  // const handleUpdateUserDisconnected = useCallback((userId)=>{
  //     if(userId){
  //         console.log("handleUpdateUserDisconnected ", userId);
  //         disconnectUser(userId);
  //     }
  // },[])
  const handleLiveUserUpdateList = useCallback((mainUserList, isBefore) => {
    if (isBefore) {
      setUserList(mainUserList);
    }
  }, []);
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  const uploadChunk = useCallback(async (base64Data, index, total, filename) => {
    if (stopUploadRef.current) return;

    try {
      // const base64Data = await blobToBase64(chunk);
      const formData = new FormData();
      formData.append("chunk", base64Data);
      formData.append("file_name", filename);
      formData.append("current_chunk", index);
      formData.append("total_chunks", total);
      formData.append("file_path", "basic_kyc/video");
      const url = "api/v2/upload_chunk";

      const response = await noBaseUrlInstance.post(url, formData, {
        headers: { 
          Authorization : `Bearer ${token}`,
          "Content-Type": "multipart/form-data" 
        },
      });

      console.log(" response ", response);
      
      if (response.data.status) {
        console.log(`Chunk ${index} uploaded successfully`);

        // If final response contains .mp4, save uploaded file
        if (typeof response.data.data === "string" && response.data.data.endsWith(".mp4")) {
          setUploadedFile(response.data.data);
        }
      }
    } catch (error) {
      console.error("Upload error:", error);
    }
  }, []);


  // const uploadChunk = useCallback(async (chunk, index, filename) => {
  //   if (stopUploadRef.current) return;
    
  //   const formData = new FormData();
  //   formData.append("file", chunk, `${filename}.part${index}`);
  //   formData.append("file_name", filename);
  //   formData.append("chunkIndex", index);

  //   try {
  //     await axios.post("/api/upload-chunk", formData, {
  //       headers: { "Content-Type": "multipart/form-data" },
  //     });
  //     console.log(`Chunk ${index} uploaded successfully`);
  //   } catch (error) {
  //     console.error("Upload error:", error);
  //   }
  // }, []);

  const updateEndStream = useCallback(async () => {
    try {
      if (contentId) {
        // Construct the relative URL for the request
        const url = `/v1/content/updateContentStatus?id=${contentId}&eventStatus=End`;
        console.log(`Making request to: ${thirdPartServerUrl + url}`);

        // Make the PUT request to update the content status
        const response = await noBaseUrlInstance.put(url);

        // Log and return the response data
        console.log("Response:", response.data);
        return response.data;
      } else {
        // Log a warning if contentId is not provided
        console.log("contentId is not defined:", contentId);
      }
    } catch (error) {
      console.log("error ", error);
    }
  }, [contentId]);

  const finalizeRecording = useCallback(
    async (filename) => {
      if (totalChunksRef.current > 0) {
        try {
          await axios.post("/api/merge-and-convert", {
            filename,
            totalChunks: totalChunksRef.current,
            userId: artistId ? artistId : "12345678",
            contentId,
          });
          console.log(`Recording finalized`);
        } catch (error) {
          console.log("Merge and conversion error:", error);
        }
      } else {
        console.log("No chunks to merge and convert");
      }
    },
    [artistId, contentId]
  );

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    }
  }, []);

  const startStreamAndRecord = useCallback(
    async (filename) => {
      console.log("Starting stream and recording...");
      totalChunksRef.current = 0;
      chunkIndexRef.current = 1;
      stopUploadRef.current = false;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localVideoRef.current.srcObject = stream;
        streamRef.current = stream;
        setLocalStream(stream);
        socketManager.liveStreamStarted(mainroomname);

        // if(userList.length>0){
        //     userList.forEach(async(user)=>{
        //         let previousUser = previousSended.some((u)=> u.userSocketId === user.userSocketId);
        //         if(!previousUser){
        //             setPreviousSended(previous => [...previous, user]);
        //             await createPeerConnectionCreator(stream, user.userSocketId);
        //         }
        //     })
        // }

        // server same
        // new user join alert from sockectManger to host
        // useEffect webrtc createPeerConnectionCreator
        // receive answer

        const recorder = new MediaRecorder(stream, {
          mimeType: "video/webm; codecs=vp8,opus",
        });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = async (event) => {
          if (event.data.size > 0 && !stopUploadRef.current) {
            console.log(
              `Data available: uploading chunk ${chunkIndexRef.current}`
            );
            // await uploadChunk(event.data, chunkIndexRef.current, filename);
            const base64Data = await blobToBase64(event.data);
            await uploadChunk(base64Data, chunkIndexRef.current, totalChunksRef?.current, filename);
            totalChunksRef.current += 1;
            chunkIndexRef.current += 1;
          } else {
            console.log("Data available but upload stopped or data is empty");
          }
        };

        recorder.onstop = async () => {
          await updateEndStream();
          console.log(
            "Recorder stopped, cleaning up stream and finalizing recording"
          );
          cleanupStream();
          await finalizeRecording(filename);
        };

        recorder.start(10000); // Chunk every 10 seconds
        setRecording(true);
        console.log("Recording started");
        // let contentId = "66a0dd05fb66534ea97e8d61";
        // updateVideoStatus(contentId, "Inprocess", null);
      } catch (error) {
        console.error("Stream and recording error:", error);
      }
    },
    [
      cleanupStream,
      finalizeRecording,
      mainroomname,
      updateEndStream,
      uploadChunk,
    ]
  );

  const stopRecording = useCallback(() => {
    setIsLoading(true);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      console.log("afterr stop");
      setRecording(false);
      stopUploadRef.current = true; // Stop any future uploads immediately
    }
  }, []);

  const handleArtistDisconnected = useCallback(
    async (message) => {
      console.log("handleArtistDisconnected", message);
      socketManager.socket.disconnect();
      navigate("/end-stream");
    },
    [navigate]
  );

  useEffect(() => {
    socketManager.newUserJoinedInMainRoom(handleJoinedRoom);
    socketManager.onUpdategoLive(handlegoLiveOffer);
    socketManager.receviedAnswer(handleReceviedAnswer);
    socketManager.receviedIceCandidate(handleReceviedCandidate);
    socketManager.onUpdatedUserList(handleUserUpdateList);
    socketManager.onUpdateLiveUserList(handleLiveUserUpdateList);
    socketManager.onArtistDisconnected(handleArtistDisconnected);
    // socketManager.updateUserDisconnected(handleUpdateUserDisconnected)
    // socketManager.createMainRoom("", artistId, true)

    return () => {
      socketManager.socket.off("update-user-list", handleUserUpdateList);
      socketManager.socket.off("newUserJoined", handleJoinedRoom);
      socketManager.socket.off("answer", handleReceviedAnswer);
      socketManager.socket.off("ice-candidate", handleReceviedCandidate);
      socketManager.socket.off("updategoLive", handlegoLiveOffer);
      socketManager.socket.off(
        "live-update-user-list",
        handleLiveUserUpdateList
      );
      socketManager.socket.off("artist-disconnected", handleArtistDisconnected);
      // socketManager.socket.off('update-user-disconnected', handleUpdateUserDisconnected);

      // webRTCManagerLive.cleanUp();
    };
  }, [
    handleJoinedRoom,
    handlegoLiveOffer,
    handleReceviedAnswer,
    handleReceviedCandidate,
    handleUserUpdateList,
    handleLiveUserUpdateList,
    handleArtistDisconnected,
  ]);

  useEffect(() => {
    if (isLoading) {
      const interval = setTimeout(() => {
        setIsLoading(false);
        // socketManager.onChangedEvent(true);
        socketManager.onArtistDisconnect(mainroomname);
        // navigate("/end-stream");
      }, 2000); // 2 seconds

      // Cleanup function
      return () => clearTimeout(interval);
    }
  }, [isLoading, mainroomname, navigate]);

  useEffect(() => {
    console.log("create main room ");
    if (mainroomname && artistId) {
      socketManager.createMainRoom(mainroomname, artistId, true);
    }

    console.log(`Generated filename: ${filenameRef.current}`);
    startStreamAndRecord(filenameRef.current);
  }, [artistId, mainroomname, startStreamAndRecord]);

  useEffect(() => {
    if (localStream && userList.length > 0) {
      userList.forEach(async (user) => {
        let previousUser = previousSended.some(
          (u) => u.userSocketId === user.userSocketId
        );
        if (!previousUser) {
          setPreviousSended((previous) => [...previous, user]);
          await createPeerConnectionCreator(
            localStream,
            user.userSocketId,
            mainroomname
          );
        }
      });
    }
  }, [
    createPeerConnectionCreator,
    localStream,
    mainroomname,
    previousSended,
    userList,
  ]);

  console.log("CONETENTid ===", contentId);

  return (
    <div className="container">
      <div className="top_live_screen">
        <video ref={localVideoRef} autoPlay muted className="video" />
      </div>
      {recording && (
        <div className="bottom_tabs_action">
          {mute ? (
            <button className="mic_on" onClick={handleAudio}>
              <Micon />
            </button>
          ) : (
            <button className="mic_on" onClick={handleAudio}>
              <MicOff />
            </button>
          )}

          <button className="end-stream" onClick={stopRecording}>
            End Stream
          </button>

          <button className="switch_camera" onClick={handleSwitchCamera}>
            <SwitchCamera />
          </button>
        </div>
      )}
    </div>
  );
};

export default MediaRecord;
