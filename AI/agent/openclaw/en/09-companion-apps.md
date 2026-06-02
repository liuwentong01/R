# 09 - Companion Apps Architecture

## Overview

OpenClaw is a multi-platform system. In addition to the core Gateway (Node.js), there are multiple companion apps that connect to the Gateway for interaction.

```
                    Gateway (Node.js)
                   ws://127.0.0.1:18789
                          │
          ┌───────────────┼───────────────────┐
          │               │                   │
    ┌─────┴─────┐   ┌────┴────┐   ┌─────────┴─────────┐
    │  macOS App │   │ CLI     │   │  Control UI (Web)  │
    │  (Swift)   │   │(Node.js)│   │  (Lit + Vite)      │
    └───────────┘   └─────────┘   └────────────────────┘
          │
    ┌─────┴──────────────┐
    │ iOS App  │ Android  │
    │ (Swift)  │ (Kotlin) │
    └──────────┴──────────┘
```

## macOS App

### Swabble Framework

The macOS app is built on the **Swabble** framework (`Swabble/` in the project root), a Swift voice assistant framework:

```
Swabble/
├── Package.swift                # Swift Package Manager
├── Sources/
│   ├── SwabbleCore/
│   │   ├── Config/
│   │   │   └── Config.swift              # configuration management
│   │   ├── Hooks/
│   │   │   └── HookExecutor.swift        # hook executor
│   │   ├── Speech/
│   │   │   ├── BufferConverter.swift      # audio buffer conversion
│   │   │   └── SpeechPipeline.swift       # speech pipeline
│   │   └── Support/
│   │       ├── Logging.swift              # logging
│   │       ├── OutputFormat.swift         # output format
│   │       ├── TranscriptsStore.swift     # transcript storage
│   │       └── AttributedString+Sentences.swift
│   │
│   ├── SwabbleKit/
│   │   └── WakeWordGate.swift            # wake word detection
│   │
│   └── swabble/
│       ├── CLI/
│       │   └── CLIRegistry.swift         # CLI command registration
│       ├── Commands/                      # CLI commands
│       │   ├── DoctorCommand.swift
│       │   ├── ServeCommand.swift
│       │   ├── SetupCommand.swift
│       │   ├── TranscribeCommand.swift
│       │   ├── MicCommands.swift
│       │   └── ...
│       └── main.swift
│
└── Tests/
    ├── SwabbleKitTests/
    │   └── WakeWordGateTests.swift
    └── swabbleTests/
        └── ConfigTests.swift
```

### macOS App Features

```
macOS App (Menu Bar):
├── Menu bar control plane
│   ├── Gateway status display
│   ├── Channel status overview
│   └── Quick action entry points
│
├── Voice Wake (wake word)
│   ├── Always listening for the wake word
│   ├── Activates Talk mode once detected
│   └── Custom wake word configuration
│
├── Talk Mode (voice conversation)
│   ├── Push-to-talk (PTT)
│   ├── Continuous voice mode
│   ├── ElevenLabs TTS + system TTS fallback
│   └── Floating overlay UI
│
├── WebChat (embedded web chat)
│   └── Uses the Gateway WS API
│
├── Canvas (visualization workspace)
│   └── Renders HTML/CSS/JS pushed by the Agent
│
├── Debugging tools
│   ├── Log viewing
│   ├── Session inspection
│   └── Network status
│
└── Remote Gateway control
    └── Connect to a remote Gateway (via Tailscale/SSH)
```

## iOS App

### Project Structure

```
apps/ios/
├── Sources/
│   ├── OpenClawApp.swift           # app entry point
│   ├── RootView.swift              # root view
│   ├── RootTabs.swift              # tab navigation
│   ├── RootCanvas.swift            # Canvas root view
│   ├── HomeToolbar.swift           # home toolbar
│   ├── SessionKey.swift            # session key management
│   │
│   ├── Gateway/                    # Gateway connection
│   │   ├── GatewayConnectionController.swift  # connection controller
│   │   ├── GatewayDiscoveryModel.swift        # Bonjour discovery
│   │   ├── GatewayServiceResolver.swift       # service resolution
│   │   ├── GatewayHealthMonitor.swift         # health monitoring
│   │   ├── GatewaySettingsStore.swift         # settings storage
│   │   ├── GatewaySetupCode.swift             # setup code
│   │   ├── GatewayTrustPromptAlert.swift      # trust prompt
│   │   ├── GatewayConnectConfig.swift         # connection config
│   │   ├── KeychainStore.swift                # keychain storage
│   │   └── TCPProbe.swift                     # TCP probe
│   │
│   ├── Chat/                       # chat features
│   │   ├── ChatSheet.swift         # chat panel
│   │   └── IOSGatewayChatTransport.swift  # chat transport
│   │
│   ├── Camera/                     # camera capability
│   │   └── CameraController.swift
│   │
│   ├── Screen/                     # screen recording
│   │   ├── ScreenController.swift
│   │   ├── ScreenRecordService.swift
│   │   └── ScreenTab.swift
│   │
│   ├── Location/                   # location services
│   │   ├── LocationService.swift
│   │   └── SignificantLocationMonitor.swift
│   │
│   ├── Contacts/                   # contacts
│   │   └── ContactsService.swift
│   │
│   ├── Calendar/                   # calendar
│   │   └── CalendarService.swift
│   │
│   ├── Media/                      # media
│   │   └── PhotoLibraryService.swift
│   │
│   ├── Motion/                     # motion sensors
│   │   └── MotionService.swift
│   │
│   ├── Capabilities/               # Node capability routing
│   │   └── NodeCapabilityRouter.swift
│   │
│   ├── Model/                      # data model
│   │   ├── NodeAppModel.swift      # app data model
│   │   └── NodeAppModel+Canvas.swift
│   │
│   ├── Onboarding/                 # onboarding
│   │   ├── OnboardingWizardView.swift
│   │   ├── GatewayOnboardingView.swift
│   │   ├── OnboardingStateStore.swift
│   │   └── QRScannerView.swift    # QR code scan pairing
│   │
│   ├── LiveActivity/               # Live Activity (Dynamic Island)
│   │   ├── LiveActivityManager.swift
│   │   └── OpenClawActivityAttributes.swift
│   │
│   ├── Push/                       # push notifications
│   │   ├── PushRegistrationManager.swift
│   │   └── PushRelayClient.swift
│   │
│   ├── Settings/                   # settings
│   │   └── SettingsTab.swift
│   │
│   └── Services/                   # service layer
│       ├── NodeServiceProtocols.swift
│       ├── NotificationService.swift
│       └── WatchMessagingService.swift
│
├── ShareExtension/                 # share extension
│   └── ShareViewController.swift
│
├── ActivityWidget/                 # Live Activity widget
│   └── OpenClawLiveActivity.swift
│
└── Config/
    ├── Signing.xcconfig
    └── Version.xcconfig
```

### iOS App as a Node

The iOS app connects as a Node of the Gateway, providing device capabilities:

```
iOS Node capabilities:
├── camera.snap     → CameraController
├── camera.clip     → CameraController (video)
├── screen.record   → ScreenRecordService
├── location.get    → LocationService
├── canvas.push     → RootCanvas (WebView rendering)
├── canvas.eval     → RootCanvas (JS execution)
├── canvas.snapshot → RootCanvas (screenshot)
├── contacts.list   → ContactsService
├── calendar.*      → CalendarService
├── photos.*        → PhotoLibraryService
├── motion.*        → MotionService
└── system.notify   → NotificationService
```

### Bonjour Auto-Discovery

```
iOS device ←── Bonjour/mDNS ──→ Gateway (macOS)

1. The Gateway broadcasts an mDNS service
2. The iOS app automatically discovers Gateways on the same network
3. The user selects a Gateway to pair with
4. Or scans a QR code for quick pairing
```

## Android App

### Project Structure

```
apps/android/
├── app/src/main/java/ai/openclaw/app/
│   ├── MainActivity.kt              # main Activity
│   ├── MainViewModel.kt             # main ViewModel
│   ├── NodeApp.kt                   # Node app
│   ├── NodeRuntime.kt               # Node.js runtime
│   ├── NodeForegroundService.kt     # foreground service
│   │
│   ├── gateway/                     # Gateway connection
│   │   ├── GatewaySession.kt        # Gateway session
│   │   ├── GatewayDiscovery.kt      # Bonjour discovery
│   │   ├── GatewayEndpoint.kt       # endpoint config
│   │   ├── GatewayProtocol.kt       # protocol implementation
│   │   ├── GatewayTls.kt            # TLS support
│   │   ├── DeviceAuthStore.kt       # device authentication
│   │   ├── DeviceIdentityStore.kt   # device identity
│   │   └── DeviceAuthPayload.kt     # authentication payload
│   │
│   ├── chat/                        # chat features
│   │   ├── ChatController.kt        # chat controller
│   │   └── ChatModels.kt            # chat data models
│   │
│   ├── node/                        # Node capability handlers
│   │   ├── InvokeDispatcher.kt      # command dispatch
│   │   ├── InvokeCommandRegistry.kt # command registration
│   │   ├── ConnectionManager.kt     # connection management
│   │   ├── CameraHandler.kt         # camera
│   │   ├── CameraCaptureManager.kt  # camera management
│   │   ├── LocationHandler.kt       # location
│   │   ├── ContactsHandler.kt       # contacts
│   │   ├── CalendarHandler.kt       # calendar
│   │   ├── PhotosHandler.kt         # photos
│   │   ├── SmsHandler.kt            # SMS
│   │   ├── NotificationsHandler.kt  # notifications
│   │   ├── MotionHandler.kt         # motion sensors
│   │   ├── DeviceHandler.kt         # device info
│   │   ├── SystemHandler.kt         # system commands
│   │   ├── CanvasController.kt      # Canvas control
│   │   ├── DebugHandler.kt          # debugging
│   │   └── A2UIHandler.kt           # A2UI handling
│   │
│   ├── voice/                       # voice features
│   │   ├── TalkModeManager.kt       # Talk mode
│   │   ├── MicCaptureManager.kt     # microphone
│   │   ├── VoiceWakeManager.kt      # voice wake
│   │   └── TalkDirectiveParser.kt   # directive parsing
│   │
│   ├── ui/                          # UI layer
│   │   ├── RootScreen.kt            # root screen
│   │   ├── ConnectTabScreen.kt      # connect tab
│   │   ├── VoiceTabScreen.kt        # voice tab
│   │   ├── ChatSheet.kt             # chat panel
│   │   ├── CanvasScreen.kt          # Canvas screen
│   │   ├── OnboardingFlow.kt        # onboarding
│   │   ├── SettingsSheet.kt         # settings
│   │   └── chat/                    # chat UI components
│   │
│   ├── tools/                       # tool display
│   │   └── ToolDisplay.kt
│   │
│   └── protocol/                    # protocol constants
│       ├── OpenClawProtocolConstants.kt
│       └── OpenClawCanvasA2UIAction.kt
│
└── build.gradle.kts
```

### Android-Specific Capabilities

Compared to iOS, Android additionally provides:
```
Android-only:
├── sms.send     → SmsHandler (send SMS)
├── sms.list     → SmsHandler (read SMS)
├── calllog.*    → CallLogHandler (call log)
├── notifications.list → notification listener service
└── device.update → app update check
```

## CLI (Command-Line Interface)

### Structure

```
src/cli/
├── deps.ts          # dependency injection (createDefaultDeps)
├── progress.ts      # progress indicator (osc-progress + @clack/prompts)
├── command-format.ts # command formatting
└── ...

src/commands/
├── agent.ts         # openclaw agent --message "..."
├── gateway.ts       # openclaw gateway [run|restart|stop]
├── onboard.ts       # openclaw onboard
├── send.ts          # openclaw message send
├── status.ts        # openclaw status
├── doctor.ts        # openclaw doctor
├── config.ts        # openclaw config
├── channels.ts      # openclaw channels
├── sessions.ts      # openclaw sessions
├── models.ts        # openclaw models
├── plugins.ts       # openclaw plugins
├── cron.ts          # openclaw cron
├── pairing.ts       # openclaw pairing
├── browser.ts       # openclaw browser
├── security.ts      # openclaw security
└── ...
```

### Key CLI Commands

```bash
# Installation & setup
openclaw onboard --install-daemon   # interactive setup wizard
openclaw doctor                     # diagnostic check

# Gateway management
openclaw gateway --port 18789 --verbose  # start the Gateway in foreground debug mode
openclaw gateway status             # view daemon status
openclaw gateway restart            # restart
openclaw gateway stop               # stop

# Messages
openclaw agent --message "..." --thinking high  # talk to the Agent directly
openclaw message send --target +86... --message "Hi"  # send a message

# Channel management
openclaw channels status --probe    # channel status
openclaw channels login --channel whatsapp  # log in to a channel

# Session management
openclaw sessions --json            # list sessions
openclaw sessions cleanup --dry-run # cleanup preview

# Model management
openclaw models list                # list available models
openclaw models set provider/model-id  # set the default model
openclaw models auth login --provider openai   # model authentication

# Other
openclaw update --channel stable    # update
openclaw plugins list               # plugin list
openclaw security audit             # security audit
```

## Control UI (Web Interface)

### Tech Stack

```
ui/
├── index.html          # entry HTML
├── package.json        # standalone package
├── vite.config.ts      # Vite build config
├── src/
│   ├── main.ts         # entry point
│   ├── styles.css      # global styles
│   ├── i18n/           # internationalization
│   ├── ui/             # UI components
│   └── local-storage.ts # local storage
└── public/             # static assets

Technology choices:
├── Lit (Web Components)  # UI framework
├── Vite                   # build tool
├── TypeScript             # language
└── Legacy Decorators      # Lit decorators (@state, @property)
```

### Features

```
Control UI features:
├── Dashboard
│   ├── Gateway health status
│   ├── Channel connection status
│   ├── Active session list
│   └── System metrics
│
├── Chat
│   ├── WebChat interface
│   ├── Multi-session switching
│   └── Media message support
│
├── Sessions (session management)
│   ├── Session list
│   ├── Session details/history
│   └── Session reset/delete
│
├── Channels (channel management)
│   ├── Channel status
│   ├── Channel configuration
│   └── Pairing management
│
├── Skills (skill management)
│   ├── Installed skills
│   ├── Enable/disable
│   └── ClawHub browsing
│
├── Settings
│   ├── Model configuration
│   ├── Agent configuration
│   └── Security settings
│
└── Logs
    └── Real-time log stream
```

## Protocol Types and Code Generation

OpenClaw's cross-platform communication uses type-safe protocol definitions:

```
TypeBox Schema (TypeScript)
    │
    ├──→ JSON Schema → Swift model generation (iOS/macOS)
    │
    └──→ Kotlin manual alignment (Android)

This ensures all platforms use consistent protocol definitions.
```
