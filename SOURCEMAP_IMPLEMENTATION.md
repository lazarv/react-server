# Source Map Support for Production Error Stack Traces

## Overview

This implementation adds support for converting production error stack traces back to their original source locations using source maps. When you build with the `--sourcemap` flag, error messages in production will show the original file locations and line numbers instead of the compiled/bundled locations.

## How It Works

### 1. Source Map Detection

When the server starts in production mode, it checks if source map files (`.map`) exist alongside the built files in the output directory (default: `.react-server/server/`). If found, the `SOURCEMAP_SUPPORT` flag is set in the runtime context.

**File**: `lib/start/ssr-handler.mjs`
- Checks for `.map` files during initialization
- Sets the `SOURCEMAP_SUPPORT` runtime flag

### 2. Stack Trace Conversion

The `source-map-support` package is dynamically imported and installed at server startup when source maps are detected. It automatically hooks into Node.js's `Error.prepareStackTrace` to convert stack traces:

**Package**: `source-map-support` (dynamically loaded)
- Only imported when `.map` files are detected
- Automatically loads `.map` files from the file system
- Caches parsed source maps for performance
- Hooks into Node.js error handling
- Transparently converts all stack traces system-wide

### 3. Error Logging Integration

Once `source-map-support` is installed, all errors throughout the application automatically have their stack traces converted. No manual conversion is needed at individual error points.

**Files Modified**:
- `lib/start/ssr-handler.mjs` - Installs source-map-support at startup

## Usage

### Building with Source Maps

```bash
# Build with separate source map files
npx react-server build --sourcemap

# Build with inline source maps
npx react-server build --sourcemap inline

# Build with hidden source maps (not referenced in code)
npx react-server build --sourcemap hidden
```

### Starting the Production Server

```bash
npx react-server start
```

The server will automatically detect if source maps are available and use them for error reporting.

## Example

### Without Source Maps

```
Error: Something went wrong
    at /app/.react-server/server/index.mjs:1234:56
    at /app/.react-server/server/render.mjs:789:12
```

### With Source Maps

```
Error: Something went wrong
    at /app/src/components/MyComponent.jsx:45:23
    at /app/src/pages/index.jsx:12:8
```

## Implementation Details

### Modified Files

1. **server/symbols.mjs**
   - Added `SOURCEMAP_SUPPORT` symbol for runtime flag

2. **lib/start/ssr-handler.mjs**
   - Detects source map availability on startup (checks for `.map` files)
   - Dynamically imports `source-map-support` only when source maps are detected
   - Sets `SOURCEMAP_SUPPORT` runtime flag
   - Installs `source-map-support` when source maps are available

### Dependencies Added

- `source-map-support` - Automatically converts stack traces using source maps (dynamically loaded only when needed)

## Performance Considerations

- **Dynamic Loading**: `source-map-support` is only imported when source maps are detected, reducing memory footprint in development and when source maps aren't available
- **One-time Check**: Source map detection happens once at server startup, not on every request
- **Efficient Caching**: `source-map-support` caches parsed source maps in memory after first load
- **Minimal Overhead**: Hooks are installed once at startup with negligible performance impact
- **Graceful Fallback**: Falls back to original stack trace if source map lookup fails

## Conditional Execution

The source map conversion **only happens when**:
1. The build was created with `--sourcemap` flag
2. The `.map` files exist in the output directory
3. Running in production mode (not dev mode)
4. An error occurs

## Testing

To test the implementation:

1. Build with source maps:
   ```bash
   cd examples/hello-world
   npx react-server build --sourcemap
   ```

2. Start the production server:
   ```bash
   npx react-server start
   ```

3. Trigger an error in your application and check the console output

4. Verify that stack traces show original source locations

## Notes

- Dev mode already has source map support through Vite's module graph
- This implementation is specifically for production builds
- Source maps should be kept secure and not deployed to public-facing servers if they contain sensitive information
- The `--sourcemap hidden` option generates source maps but doesn't reference them in the code (useful for error tracking without exposing sources)
