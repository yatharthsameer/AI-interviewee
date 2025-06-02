// pages/index.js
import { useRef, useState, useEffect } from 'react'

// native Speech-to-Text (Web Speech API)
const SpeechRecognition =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition)

// ──────────────────────────────────────────────────────────────────────
// Helper to normalise common tech terms that STT often mangles
// ──────────────────────────────────────────────────────────────────────
function normaliseTechTerms(text) {
  const replacements = {
    'react': 'React',
    'react.js': 'React.js',
    'next.js': 'Next.js',
    'nextjs': 'Next.js',
    'typescript': 'TypeScript',
    'javascript': 'JavaScript',
    'node.js': 'Node.js',
    'nodejs': 'Node.js',
    'python': 'Python',
    'java': 'Java',
    'golang': 'Go',
    'go lang': 'Go',
    'kubernetes': 'Kubernetes',
    'k8s': 'Kubernetes',
    'docker': 'Docker',
    'aws': 'AWS',
    'azure': 'Azure',
    'gcp': 'GCP',
    'api': 'API',
    'rest': 'REST',
    'graphql': 'GraphQL',
    'sql': 'SQL',
    'nosql': 'NoSQL',
    'mongodb': 'MongoDB',
    'postgres': 'PostgreSQL',
    'postgresql': 'PostgreSQL',
    'mysql': 'MySQL',
    'redis': 'Redis',
    'kafka': 'Kafka',
    'rabbitmq': 'RabbitMQ',
    'grpc': 'gRPC',
    'http': 'HTTP',
    'https': 'HTTPS',
    'ssl': 'SSL',
    'tls': 'TLS',
    'ssh': 'SSH',
    'git': 'Git',
    'github': 'GitHub',
    'gitlab': 'GitLab',
    'bitbucket': 'Bitbucket',
    'jenkins': 'Jenkins',
    'ci/cd': 'CI/CD',
    'cicd': 'CI/CD',
    'devops': 'DevOps',
    'mlops': 'MLOps',
    'ai': 'AI',
    'ml': 'ML',
    'machine learning': 'Machine Learning',
    'artificial intelligence': 'Artificial Intelligence',
    'deep learning': 'Deep Learning',
    'neural network': 'Neural Network',
    'tensorflow': 'TensorFlow',
    'pytorch': 'PyTorch',
    'scikit-learn': 'scikit-learn',
    'pandas': 'Pandas',
    'numpy': 'NumPy',
    'jupyter': 'Jupyter',
    'vscode': 'VS Code',
    'visual studio code': 'VS Code',
    'vim': 'Vim',
    'emacs': 'Emacs',
    'linux': 'Linux',
    'ubuntu': 'Ubuntu',
    'debian': 'Debian',
    'centos': 'CentOS',
    'redhat': 'Red Hat',
    'amazon web services': 'AWS',
    'google cloud': 'GCP',
    'google cloud platform': 'GCP',
    'cloud': 'Cloud',
    'serverless': 'Serverless',
    'microservices': 'Microservices',
    'monolith': 'Monolith',
    'agile': 'Agile',
    'scrum': 'Scrum',
    'kanban': 'Kanban',
    'sprint': 'Sprint',
    'standup': 'Standup',
    'retro': 'Retro',
    'jira': 'Jira',
    'confluence': 'Confluence',
    'slack': 'Slack',
    'teams': 'Teams',
    'zoom': 'Zoom',
    'meet': 'Meet',
    'calendar': 'Calendar',
    'outlook': 'Outlook',
    'gmail': 'Gmail',
    'chrome': 'Chrome',
    'firefox': 'Firefox',
    'safari': 'Safari',
    'edge': 'Edge',
    'internet explorer': 'IE',
    'ie': 'IE',
    'windows': 'Windows',
    'mac': 'Mac',
    'macos': 'macOS',
    'ios': 'iOS',
    'android': 'Android',
    'mobile': 'Mobile',
    'web': 'Web',
    'desktop': 'Desktop',
    'laptop': 'Laptop',
    'server': 'Server',
    'client': 'Client',
    'frontend': 'Frontend',
    'front end': 'Frontend',
    'backend': 'Backend',
    'back end': 'Backend',
    'fullstack': 'Fullstack',
    'full stack': 'Fullstack',
    'full-stack': 'Fullstack',
  }

  let result = text
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`\\b${key}\\b`, 'gi'), value)
  }
  return result
}

export default function Home() {
  const [sid, setSid] = useState(null)
  const [mounted, setMounted] = useState(false)
  const [error, setError] = useState(null)
  const [listening, setListening] = useState(false)
  const videoRef = useRef(null)
  const peerConnectionRef = useRef(null)
  const recRef = useRef(null) // holds our SpeechRecognition instance

  useEffect(() => {
    setMounted(true)
  }, [])

  const startInterview = async () => {
    try {
      const backend = 'http://localhost:5001'

      // 1) ask backend for a session
      const r = await fetch(`${backend}/api/session`, { method: 'POST' })
      if (!r.ok) throw new Error('Failed to create session')
      const { session_id, sdpOffer, iceServers } = await r.json()
      setSid(session_id)

      // 2) build PeerConnection
      const pc = new RTCPeerConnection({ iceServers })
      peerConnectionRef.current = pc

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          fetch(`${backend}/api/ice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id, candidate: e.candidate }),
          })
        }
      }

      pc.ontrack = (e) => {
        // render avatar into <video>
        if (videoRef.current && !videoRef.current.srcObject) {
          videoRef.current.srcObject = e.streams[0]
        }
      }

      // 3) set remote SDP & create answer
      await pc.setRemoteDescription(sdpOffer) // sdpOffer is already an object {type:"offer",sdp:"..."}
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      // 4) send answer.sdp (raw string) to /api/start
      const startRes = await fetch(`${backend}/api/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id, sdp: answer.sdp }),
      })
      if (!startRes.ok) throw new Error('Failed to start session')

      // 5) Begin microphone STT → send text → avatar responds
      if (!SpeechRecognition) {
        console.warn('Web Speech API not supported; please use Chrome/Edge.')
        return
      }

      // Only create one SpeechRecognition instance
      const rec = new SpeechRecognition()
      recRef.current = rec
      rec.continuous = true
      rec.interimResults = true
      rec.lang = 'en-US'
      let lastFinalUtterances = []        // small LRU to drop duplicates
      let restartCooldown = false         // prevent rapid flapping

      rec.onresult = async (ev) => {
        // grab *final* sentences only
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const res = ev.results[i]
          if (!res.isFinal) continue

          const userText = res[0].transcript.trim()
          const cleaned = normaliseTechTerms(userText)

          // de-dup exact repeats
          if (lastFinalUtterances.includes(cleaned.toLowerCase())) return
          lastFinalUtterances.push(cleaned.toLowerCase())
          if (lastFinalUtterances.length > 3) lastFinalUtterances.shift()

          console.log('User said:', cleaned)

          // send to backend → avatar speaks
          await fetch(`${backend}/api/send_text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id, text: cleaned, generate_ai: true }),
          })
        }
      }

      rec.onerror = (e) => {
        console.error('STT error:', e.error)
        if (e.error === 'no-speech') return
      }

      rec.onend = () => {
        console.log('SpeechRecognition ended')
        setListening(false)

        if (restartCooldown) return         // wait a tick
        restartCooldown = true
        setTimeout(() => { restartCooldown = false }, 400)

        try {
          rec.start()
          setListening(true)
        } catch (err) {
          if (err.name !== 'InvalidStateError') console.error(err)
        }
      }

      // Only call `.start()` exactly once here:
      try {
        rec.start()
        setListening(true)
      } catch (err) {
        if (err.name !== 'InvalidStateError') {
          console.error('Failed to start STT:', err)
        }
      }
    } catch (err) {
      setError(err.message)
      console.error('Interview error:', err)
    }
  }

  const endInterview = async () => {
    try {
      const backend = 'http://localhost:5001'

      // 1) stop STT
      if (recRef.current) {
        try {
          recRef.current.stop()
        } catch (err) {
          console.warn('STT stop error:', err)
        }
      }
      setListening(false)

      // 2) close PeerConnection
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
        peerConnectionRef.current = null
      }

      // 3) tell backend to close HeyGen session
      await fetch(`${backend}/api/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sid }),
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
    <div style={{ textAlign: 'center', marginTop: '2rem' }}>
      {error && (
        <div style={{ color: 'red', marginBottom: '1rem' }}>
          Error: {error}
        </div>
      )}

      {/* ── video container ─────────────────────────────────────────── */}
      <div style={{ marginTop: '1rem' }}>
        {mounted && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            style={{ width: '640px', height: '480px', background: '#000' }}
            controls
          />
        )}
      </div>

      {/* ── button & "Say something…" hint below the video ───────────── */}
      <div style={{ marginTop: '1rem' }}>
        {!sid && <button onClick={startInterview}>Start Interview</button>}
        {sid && <button onClick={endInterview}>End Interview</button>}
        {sid && !listening && SpeechRecognition && (
          <p style={{ marginTop: '0.5rem' }}>🎙  Say something…</p>
        )}
      </div>
    </div>
  )
}
