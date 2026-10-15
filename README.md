# VocabPro — Lookup · TTS · Translate

VocabPro is a Chrome extension that helps you learn English vocabulary directly while browsing the web. It combines dictionary lookup, quick translation, and text-to-speech in a compact, easy-to-use interface.

## Features

- **Dictionary Lookup:** Double-click an English word to view its pronunciation, part of speech, CEFR level, definitions, and example sentences.
- **Quick Translation:** Select text and click the translate button on the toolbar. Supports both **EN → VI** and **VI → EN** translation.
- **Translate on Copy:** Press `Ctrl+C` after selecting text to automatically display the translation.
- **Text-to-Speech:** Select two or more words and click the speaker button to read the text aloud. Supports **Web Speech** and **ElevenLabs**.
- **Save Vocabulary:** Save word definitions to your VocabPro account directly from the dictionary card.
- **Local Caching:** Dictionary data and audio are cached locally to reduce network requests.

## Installation from Source

1. Download or clone this repository to your computer.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked**.
5. Select the project's root directory containing `manifest.json`.
6. Open any website and reload the page to activate the extension.

## Usage

### Look Up and Save Words

1. Double-click an English word.
2. View its information in the dictionary card.
3. Click **Save Word** to add it to your account.

To synchronize and save vocabulary, sign in to [VocabPro](https://vocab.vtd26.io.vn/login). After signing in, the extension automatically detects your login status across other websites.

### Translate and Read Text

1. Select the text you want to process.
2. Click the speaker button to read it aloud or the translate button to translate it.
3. You can also press `Ctrl+C` to display the translation automatically.

Text-to-speech supports a maximum of 500 characters per request. Automatic translation on copy supports a maximum of 2,000 characters.

## Configuration

Click the VocabPro icon in the Chrome toolbar to open the settings panel.

- **Translation Direction:** Choose `EN → VI` or `VI → EN`.
- **Translation Engine:** Choose Google Translate or Gemini AI.
- **Gemini API Key:** Enter an API key when using Gemini AI. If no key is configured, the extension uses Google Translate.
- **Speech Engine:** Choose Web Speech or ElevenLabs.
- **ElevenLabs Configuration:** Add multiple API keys and Voice IDs. The extension rotates through the configured keys daily and automatically falls back to Web Speech if all keys fail.
- **Vietnamese Definitions:** Enable or disable Vietnamese meanings in dictionary cards.

Click **Save Settings** after making changes.

## Permissions

The extension requires the following permissions to operate:

- `storage` and `unlimitedStorage`: Store settings, authentication tokens, and cached data.
- **Website access:** Display the toolbar and dictionary cards and process selected text on web pages.
- **Network access:** Connect to VocabPro services, Google Translate, Gemini, and ElevenLabs when the corresponding features are enabled.

## API Key Security

API keys are stored in `chrome.storage.local` and used to make requests directly to the corresponding services.

Do not share your Chrome profile directory or API keys with others. If a key is exposed, revoke it through the relevant service provider and generate a new one.

## Troubleshooting

- **Toolbar not appearing:** Make sure the extension is enabled and reload the page after installation.
- **Dictionary lookup not working:** Check your internet connection and try looking up a single word.
- **Unable to save words:** Sign in to VocabPro again. Your authentication token may have expired.
- **Gemini translation failing:** Check your API key, usage limits, and model access permissions. The extension attempts to fall back to Google Translate if Gemini encounters an error.
- **ElevenLabs speech failing:** Check your API keys and Voice IDs. If all configured keys fail, the extension automatically switches to Web Speech.

## Project Structure

```text
manifest.json       Chrome extension configuration
content.js          Dictionary lookup, translation, and text-to-speech
content.css         Dictionary card and toolbar styles
background.js       API requests, authentication, and caching
popup/              Settings interface
vocab-bridge.js     Authentication token synchronization with VocabPro
icons/              Extension icons
```

## Technologies

- Chrome Extension Manifest V3
- JavaScript, HTML, and CSS
- VocabPro API
- Google Translate
- Gemini AI
- ElevenLabs Text-to-Speech