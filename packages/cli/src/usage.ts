// SPDX-License-Identifier: Apache-2.0

/** Usage text listing every command. */
export const USAGE = `usnea: command line tool for the Usnea 2D game engine

Usage: usnea <command> [options]

Commands:
  dev [--port N] [--host]            Start the dev server with page reload on every change
  run --headless [--frames N] [--scene path] [--replay file]
                                     Run without a display and print one JSON line of results
  inspect [scene] [--frames N] [-o file]
                                     Print the world state as JSON
  shot [scene] -o out.png [--frames N] [--width W] [--height H]
                                     Run the scene in Chromium and save a screenshot (needs playwright)
  test [--update]                    Run replay cases in tests/ and the project's Vitest files
  build                              Package the game (not implemented yet, planned for v0.3)
  import                             Convert a project from another engine (not implemented yet, planned for v0.4)
  plugin                             Install and register plugins (not implemented yet, planned for v0.2)
  doctor                             Check the environment and project (not implemented yet, planned for v0.2)

Run commands from the project folder (the one holding usnea.json).
Options: -h, --help  Show this text
`;
