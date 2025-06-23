import { useEffect, useState } from "react"

/**
 * The audio source can be either the RSS feed URL (the official URL included in the podcast feed),
 * or the transcribed file (the specific .mp3 file that was referenced during transcribing, then saved to S3)
 */
export type AudioSource = 'rssFeedURL' | 'transcribedFile'

export function useAudioSource() {
    const [audioSource, setAudioSource] = useState<AudioSource>(() => {
      // Check localStorage first, then system preference
      const stored = localStorage.getItem('audioSource') as AudioSource | null
      if (stored) return stored
      
      return 'transcribedFile' // default to transcribed file, which is the most accurate
    })

    useEffect(() => {
       // Make sure the audio source is set in localStorage
       localStorage.setItem('audioSource', audioSource)
    }, [audioSource])

  return { audioSource, setAudioSource }
} 