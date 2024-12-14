# RippleSafe Chrome Extension

A Chrome extension version of the RippleSafe XRP wallet.

## Features

- View XRP balance and assets
- Manage trustlines
- Swap tokens
- QR code for receiving XRP
- Dark mode support
- Secure local storage
- Network status indicator

## Development Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Build the extension:
```bash
npm run build
```

4. Load the extension in Chrome:
- Open Chrome and navigate to `chrome://extensions/`
- Enable "Developer mode" in the top right
- Click "Load unpacked" and select the `build` directory

## Building for Production

1. Build the extension:
```bash
npm run build
```

2. The production-ready extension will be in the `build` directory

## Security

- All sensitive data is stored in Chrome's secure storage
- No private keys are transmitted to external servers
- All network connections are made over secure WebSocket (wss://)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request 