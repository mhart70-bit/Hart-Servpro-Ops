import { useState, useRef, useCallback } from 'react'

export type RecorderState = 'idle' | 'recording' | 'processing' | 'done' | 'error'

interface UseVoiceRecorderOptions {
  onTranscript?: (transcript: string) => void
}

// Minimal interface for SpeechRecognition (not all browsers expose the global type)
interface SpeechRecognitionEvent {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent {
  error: string
}

interface SpeechRecognitionInstance {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

export function useVoiceRecorder({ onTranscript }: UseVoiceRecorderOptions = {}) {
  const [state, setState] = useState<RecorderState>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
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

    const win = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
    const SpeechRecognitionClass = (win.SpeechRecognition ?? win.webkitSpeechRecognition) as SpeechRecognitionConstructor
    const recognition = new SpeechRecognitionClass()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognitionRef.current = recognition

    recognition.onresult = (event: SpeechRecognitionEvent) => {
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

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const ERROR_MESSAGES: Record<string, string> = {
        'not-allowed':
          'Microphone access was denied. Please allow microphone access in your browser settings, then try again.',
        'no-speech':
          'No speech was detected. Please try again and speak clearly into your microphone.',
        'network':
          'A network error occurred during speech recognition. Check your connection or switch to text mode.',
        'audio-capture':
          'No microphone was found. Please connect a microphone or switch to text mode.',
        'aborted':
          'Recording was interrupted. Please try again.',
        'bad-grammar':
          'Speech recognition encountered an error. Please try again or switch to text mode.',
        'language-not-supported':
          'Speech recognition is not supported for this language. Please switch to text mode.',
        'service-not-allowed':
          'Speech recognition is blocked on this device. Please switch to text mode.',
      }
      const message = ERROR_MESSAGES[event.error] ?? 'Recording failed. Please switch to text mode and type your note.'
      setError(message)
      setState('error')
      stopTimer()
    }

    recognition.onend = () => {
      stopTimer()
      const final = finalTranscriptRef.current.trim()
      if (final) {
        setTranscript(final)
        setState('done')
        onTranscript?.(final)
      } else {
        // Preserve 'error' state if onerror already fired — don't overwrite with 'idle'
        setState(prev => (prev === 'error' ? 'error' : 'idle'))
      }
    }

    recognition.start()
  }, [isSupported, onTranscript])

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
