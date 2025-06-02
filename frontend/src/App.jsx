import React, { useState, useRef } from 'react'

const App = () => {
  const [listening, setListening] = useState(false)
  const recRef            = useRef(null)  // keep SpeechRecognition instance
  const [sid, setSid]       = useState(null)
  const [error, setError]   = useState(null)
  const videoRef            = useRef(null)
  const peerConnectionRef   = useRef(null)

  const startInterview = async () => {
    try {
      const backend = 'http://localhost:5001'
      const pc = new RTCPeerConnection()
      peerConnectionRef.current = pc

      // 1) get session ID from backend
      const { session_id: sid } = await fetch(`${backend}/api/start`, {
        method: 'POST',
      }).then(r => r.json())
      setSid(sid)

      // 2) get SDP from HeyGen
      const { sdp } = await fetch(`${backend}/api/sdp/${sid}`).then(r => r.json())

      // 3) set up WebRTC
      pc.onicecandidate = e => {
        if (e.candidate) {
          fetch(`${backend}/api/ice/${sid}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidate: e.candidate }),
          })
        }
      }

      pc.ontrack = e => {
        if (videoRef.current) {
          videoRef.current.srcObject = e.streams[0]
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      // 4) send our SDP back to HeyGen
      const sdp_str = JSON.stringify(pc.localDescription)
      await fetch(`${backend}/api/sdp/${sid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: sdp_str }),
      })

      // 5) start speech recognition
      const rec = new SpeechRecognition()
      recRef.current = rec
      rec.start()
      setListening(true)

      // remember peer-connection in state so we can close it later
      peerConnectionRef.current = pc
    } catch (err) {
      setError(err.message)
      console.error('Start-interview error:', err)
    }
  }

  /* ───────────── end / close interview ───────────────────────── */
  const endInterview = async () => {
    try {
      const backend = 'http://localhost:5001'

      // 1) stop STT
      recRef.current?.stop()
      setListening(false)

      // 2) close WebRTC pipes
      peerConnectionRef.current?.close()
      peerConnectionRef.current = null

      // 3) tell backend to stop HeyGen session
      await fetch(`${backend}/api/close`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ session_id: sid })
      })

      // 4) reset UI
      setSid(null)
      if (videoRef.current) videoRef.current.srcObject = null
    } catch (err) {
      setError(err.message)
      console.error('End-interview error:', err)
    }
  }

  return (
    <div>
      <h1>AI Interview</h1>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {listening && <div>Listening...</div>}
      <video ref={videoRef} autoPlay playsInline />
      {!sid
        ? <button onClick={startInterview}>Start Interview</button>
        : <button onClick={endInterview  }>End Interview</button>}
    </div>
  )
}

export default App 