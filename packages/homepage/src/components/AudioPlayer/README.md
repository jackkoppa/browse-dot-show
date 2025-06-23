# AudioPlayer Component

A simple audio player component for podcast playback, built on top of `react-h5-audio-player`.

## Features

- Play/pause controls
- Progress bar with scrubbing
- 10-second skip controls (forward/backward) 
- Loading state indication
- Responsive design (300px - 700px width)

## Usage

```tsx
import AudioPlayer from '@/components/AudioPlayer';

function MyComponent() {
  return (
    <AudioPlayer
      src="https://example.com/podcast.mp3#t=05:30"
      className="mb-4"
    />
  );
}
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `src` | `string` | **Required** - URL of the audio file (supports timestamp fragments like `#t=05:30`) |
| `className` | `string` | Optional additional CSS classes |

The component automatically integrates with the app's design system and theming. 