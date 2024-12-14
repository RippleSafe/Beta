# RippleSafe Beta

RippleSafe is a secure and user-friendly wallet for managing XRP and XRPL tokens. This repository contains both the web application and Chrome extension versions.

## Project Structure

- `/` - Web application root
- `/chrome-extension` - Chrome extension version

## Features

- View XRP balance and assets
- Manage trustlines
- Swap tokens
- QR code for receiving XRP
- Dark mode support
- Network status indicator
- Secure local storage
- Chrome extension support

## Web Application

The web application is built with React and TypeScript, providing a full-featured interface for managing your XRPL assets.

### Development Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Build for production:
```bash
npm run build
```

## Chrome Extension

The Chrome extension provides the same functionality in a convenient browser extension format.

### Development Setup

1. Navigate to the extension directory:
```bash
cd chrome-extension
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Build the extension:
```bash
npm run build
```

5. Load in Chrome:
- Open Chrome and navigate to `chrome://extensions/`
- Enable "Developer mode"
- Click "Load unpacked" and select the `build` directory

## Security

- All sensitive data is stored securely
- No private keys are transmitted to external servers
- All network connections are made over secure WebSocket (wss://)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
