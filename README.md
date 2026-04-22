# Credit Stamina — Mobile App

A React Native credit repair app powered by AI, Supabase, and a Node/Express backend on Railway.

---

## Environment Variables

### Mobile App (`src/config/env.js`)

Copy `src/config/env.example.js` → `src/config/env.js` and fill in:

```js
export const SUPABASE_URL      = 'https://<your-project>.supabase.co';
export const SUPABASE_ANON_KEY = '<your-anon-key>';   // safe for client-side
export const API_URL           = 'https://<your-railway-app>.up.railway.app';
```

Also set your Google Places key in `src/config/googlePlacesKey.js`:

```js
export const GOOGLE_PLACES_API_KEY = '<your-google-places-api-key>';
// Enable "Places API" in Google Cloud Console.
// Restrict the key to iOS Bundle ID: com.creditstamina
```

### Backend Railway Environment Variables

Go to your Railway project → **Variables** and add:

| Variable | Description | Where to get it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude AI API key | console.anthropic.com → API Keys |
| `SUPABASE_URL` | Your Supabase project URL | Supabase Dashboard → Settings → API |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required for in-app account deletion.** Grants admin-level access — never expose client-side. | Supabase Dashboard → Settings → API → `service_role` key |
| `PORT` | Railway sets this automatically — do not override |  |

#### Why `SUPABASE_SERVICE_ROLE_KEY` is required

The `/api/user/delete-account` endpoint deletes all user data from the database **and** removes the auth user record so they cannot sign back in. Removing the auth user requires the service role key (`supabase.auth.admin.deleteUser()`). Without it, table data is still cleared but the auth account remains — the user would be locked out but technically still exist in Supabase Auth.

> **Security note:** The service role key bypasses Row Level Security. It is only used server-side in Railway. Never commit it or ship it in the mobile app bundle.

---

This is a [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
