import React from "react";
import { UserProvider } from "./context/UserContext";
import WebRTCMain from "./components/WebRTCMain";
import "./App.css";

function App() {
  return (
    <UserProvider>
      <WebRTCMain />
    </UserProvider>
  );
}

export default App;
