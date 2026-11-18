# Keybindings

Default bindings, grouped by action context. A key can mean different things in the composer, a picker, or message history. Terminal support for modified keys varies. `/help` shows the active bindings, including customizations and plugins.

Override bindings with the `keymap` setting using these action IDs.

<!-- keys:start -->
| Action | Keys | Description |
| --- | --- | --- |
| `app.cancel` | `ctrl-c` | Clear the composer, close the picker, or press twice to exit zaly. |
| `app.copy` | `ctrl-y` | Copy (yank) the current selection or composer input to the clipboard. |
| `app.help` | `ctrl-h` | Show or hide the keyboard shortcut help overlay. |
| `app.scroll-bottom` | `end`, `ctrl-down` | Scroll to the bottom of the message history. |
| `app.scroll-down` | `pagedown`, `ctrl-d` | Scroll down in the message history. |
| `app.scroll-top` | `home`, `ctrl-up` | Scroll to the top of the message history. |
| `app.scroll-up` | `pageup`, `ctrl-u` | Scroll up in the message history. |
| `app.stop` | `esc` | Stop the current agent turn or running tool batch. |
| `composer.history` | `ctrl-r` | Browse and pick from recent composer inputs. |
| `input.cursorDown` | `down` | move cursor down one line |
| `input.cursorLeft` | `left` | move cursor left |
| `input.cursorLineEnd` | `end`, `ctrl-e` | jump to end of current line |
| `input.cursorLineStart` | `home`, `ctrl-a` | jump to start of current line |
| `input.cursorRight` | `right` | move cursor right |
| `input.cursorUp` | `up` | move cursor up one line |
| `input.deleteCharBack` | `backspace` | delete the character before the cursor |
| `input.deleteCharForward` | `delete` | delete the character at the cursor |
| `input.deleteWordBack` | `ctrl-w` | delete the word before the cursor |
| `input.insertNewline` | `shift-enter`, `alt-enter` | insert a newline at the cursor (copies leading indent) |
| `input.insertTab` | `tab` | insert an indent (two spaces) at the cursor |
| `input.paste` | `ctrl-v` | paste text from the system clipboard, or attach a pasted image |
| `input.submit` | `enter` | submit the current value |
| `picker.next` | `ctrl-n` | move to the next item that matches the query |
| `picker.prev` | `ctrl-p` | move to the previous item that matches the query |
| `select.accept` | `enter` | select the active item |
| `select.close` | `esc` | close |
| `select.complete` | `tab` | complete the active item |
| `select.first` | `home` | jump to the first item |
| `select.last` | `end` | jump to the last item |
| `select.next` | `down` | move to the next item |
| `select.page-down` | `pagedown`, `ctrl-d` | move down one page |
| `select.page-up` | `pageup`, `ctrl-u` | move up one page |
| `select.prev` | `up` | move to the previous item |
<!-- keys:end -->
