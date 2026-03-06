# Gemini AI Integration Setup

This chat application includes Google Gemini AI integration. Users can interact with Gemini by typing `@Gem` or `@Gem,` followed by their question or request.

## Features

- **Text Chat**: Ask questions and get AI responses
- **Image Generation Requests**: Request image creation (note: requires additional setup)

## Setup Instructions

### Option 1: Environment Variable (Recommended)

1. Create a `.env` file in the `chatbox/client` directory
2. Add your Gemini API key:
   ```
   VITE_GEMINI_API_KEY=your_api_key_here
   ```
3. Get your free API key from: https://makersuite.google.com/app/apikey
4. Restart your development server

### Option 2: Browser Prompt

If no API key is found, the app will prompt you to enter it when you first use `@Gem`. The key will be saved in your browser's localStorage.

## Usage

Simply type in the chat input:
- `@Gem, what's the color of a zebra?`
- `@Gem, Create a picture of a dog`
- `@Gem explain quantum computing`

The AI response will appear in the chat with a special purple styling and 🤖 emoji.

## Note on Image Generation

Gemini Pro doesn't directly generate images. For image generation, you may need to:
1. Use a separate image generation API (like DALL-E, Stable Diffusion, etc.)
2. Or use Gemini to generate detailed prompts for image generators

The current implementation will provide helpful responses about image generation requests.
