import { useState, useRef, useCallback } from 'react'

export type RecorderState = 'idle' | 'recording' | 'processing' | 'done' | 'error'

interface UseVoiceRecorderOptions {
  onTranscript?: (transcript: string) => void
}

export function useVoiceRecorder({ onTranscript }: UseVoiceRecorderOptions = {}) {
  const [state, setState] = useState<RecorderState>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const finalTranscriptRef = useRef<string>('')

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const startRecording = useCallback(() => {
    if (!isSupported) {
      setError('Voice recording is not supported in this browser. Please type your note instead.')
      return
    }

    finalTranscriptRef.current = ''
    setTranscript('')
    setError(null)
    setState('recording')
    startTimeRef.current = Date.now()

    // Track duration
    intervalRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)

    const SpeechRecognitionClass = (window.SpeechRecognition || window.webkitSpeechRecognition) as typeof SpeechRecognition
    const recognition = new SpeechRecognitionClass()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognitionRef.current = recognition

    recognition.onresult = (event) => {
      let interim = ''
      let final = finalTranscriptRef.current

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript + ' '
        } else {
          interim += event.results[i][0].transcript
        }
      }
      finalTranscriptRef.current = final
      setTranscript(final + interim)
    }

    recognition.onerror = (event) => {
      setError(`Recording error: ${event.error}. Try typing your note instead.`)
      setState('error')
      stopTimer()
    }

    recognition.onend = () => {
      stopTimer()
      const final = finalTranscriptRef.current.trim()
      if (final && state !== 'error') {
        setTranscript(final)
        setState('done')
        onTranscript?.(final)
      } else if (!final) {
        setState('idle')
      }
    }

    recognition.start()
  }, [isSupported, onTranscript, state])

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop()
    stopTimer()
  }, [])

  function stopTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setDuration(0)
  }

  const reset = useCallback(() => {
    recognitionRef.current?.abort()
    stopTimer()
    setTranscript('')
    setError(null)
    setState('idle')
    finalTranscriptRef.current = ''
  }, [])

  return {
    state,
    transcript,
    setTranscript,
    error,
    duration,
    isSupported,
    startRecording,
    stopRecording,
    reset,
  }
}

// Extend window for TypeScript
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}
