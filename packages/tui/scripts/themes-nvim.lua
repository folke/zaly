local M = {}

local colorschemes = {
	vague = "https://github.com/vague-theme/vague.nvim",
	melange = "https://github.com/savq/melange-nvim",
	cyberdream = "https://github.com/scottmckendry/cyberdream.nvim",
}

local build = vim.fn.fnamemodify("./build", ":p")
local colors = build .. "/colors"

---@class zaly.style
---@field fg? string foreground color
---@field bg? string background color
---@field bold? boolean bold text
---@field italic? boolean italic text
---@field underline? boolean underline text
---@field dim? boolean dim text
---@field inverse? boolean inverse text
---@field strikethrough? boolean strikethrough text

function M.highlights()
	local hls = vim.api.nvim_get_hl(0, {}) --[[@as table<string,vim.api.keyset.get_hl_info> ]]
	local ret = {} ---@type table<string, zaly.style>
	for group, hl in pairs(hls) do
		local defs = { hl }
		local done = { [group] = true } ---@type table<string, boolean>
		local link = hl.link
		while link and not done[link] do
			done[link] = true
			local hl_link = hls[link]
			if hl_link then
				defs[#defs + 1] = hl_link
				link = hl_link.link
			else
				break
			end
		end
		hl = #defs == 1 and defs[1] or vim.tbl_deep_extend("keep", unpack(defs))
		---@type zaly.style
		local style = {
			fg = hl.fg and ("#%06X"):format(hl.fg) or nil,
			bg = hl.bg and ("#%06X"):format(hl.bg) or nil,
			bold = hl.bold,
			italic = hl.italic,
			underline = hl.underline,
			inverse = hl.reverse,
			strikethrough = hl.strikethrough,
		}
		if not vim.tbl_isempty(style) then
			ret[group] = style
		end
	end
	return ret
end

function M.init()
	local root = vim.fn.fnamemodify("./build/nvim", ":p")
	vim.fn.mkdir(root, "p")
	vim.fn.mkdir(colors, "p")
	for _, name in ipairs({ "config", "data", "state", "cache" }) do
		---@diagnostic disable-next-line: no-unknown
		vim.env[("XDG_%s_HOME"):format(name:upper())] = root .. "/" .. name
	end
	vim.opt.packpath:prepend(root .. "/data/nvim/site")
	vim.pack.add(vim.tbl_values(colorschemes))
	vim.pack.update(nil, { force = true })
end

function M.build()
	for name in pairs(colorschemes) do
		print("Generating colorscheme JSON for: " .. name)
		vim.cmd([[hi clear]])
		vim.cmd.colorscheme(name)
		local hl = M.theme(name, M.highlights())
		local json = vim.json.encode(hl, { indent = "  ", sort_keys = true })

		local fd = vim.uv.fs_open("./assets/themes/" .. name .. ".json", "w", tonumber("644", 8))
		if not fd then
			error("Failed to open file for writing: " .. name .. ".json")
		end
		vim.uv.fs_write(fd, json, -1)
		vim.uv.fs_close(fd)
	end
end

---@param name string
---@param hls table<string, zaly.style>
---@return table<string, zaly.style>
function M.theme(name, hls)
	---@param ... string
	local function pick(...)
		for _, n in ipairs({ ... }) do
			if hls[n] then
				return hls[n]
			end
		end
	end

	---@param ... string
	local function fg(...)
		for _, n in ipairs({ ... }) do
			if hls[n] and hls[n].fg then
				return { fg = hls[n].fg }
			end
		end
	end

	---@param ... string
	local function bg(...)
		for _, n in ipairs({ ... }) do
			if hls[n] and hls[n].bg then
				return { bg = hls[n].bg }
			end
		end
	end

	return {
		name = name,
		id = name,
		primary = pick("Special"),
		accent = pick("Special"),
		text = pick("Normal"),
		muted = pick("Comment"),
		comment = pick("Comment"),
		title = pick("Title"),
		delim = pick("Delimiter"),
		subtle = pick("NormalFloat"),
		ui = pick("Normal"),
		divider = pick("WinSeparator"),
		selection = pick("Visual"),
		gutter = pick("LineNr"),
		border = pick("FloatBorder"),
		borderTitle = pick("FloatTitle"),
		success = pick("DiagnosticOk"),
		info = pick("DiagnosticInfo"),
		warn = pick("DiagnosticWarn"),
		error = pick("DiagnosticError"),
		syntaxNumber = pick("@number"),
		syntaxString = pick("@string"),
		syntaxBoolean = pick("@boolean"),
		syntaxFunction = pick("@function"),
		syntaxConstant = pick("@constant"),
		syntaxSpecial = pick("Special", "@string.special", "@punctuation.special"),
		syntaxDelimiter = pick("@punctuation.delimiter", "@punctuation.special"),
		syntaxBracket = pick("@punctuation.bracket", "@punctuation.special"),
		mdBold = pick("@markup.emphasis.markdown", "@markup.emphasis"),
		mdCode = pick("@markup.raw.markdown_inline", "@string"),
		mdCodeBlock = pick("NormalFloat"),
		mdHeading = pick("@markup.heading.markdown", "@markup.heading", "Title"),
		mdHeading1 = pick("@markup.heading.1.markdown", "@markup.heading.markdown", "@markup.heading", "Title"),
		mdHeading2 = pick("@markup.heading.2.markdown", "@markup.heading.markdown", "@markup.heading", "Title"),
		mdHeading3 = pick("@markup.heading.3.markdown", "@markup.heading.markdown", "@markup.heading", "Title"),
		mdHeading4 = pick("@markup.heading.4.markdown", "@markup.heading.markdown", "@markup.heading", "Title"),
		mdHeading5 = pick("@markup.heading.5.markdown", "@markup.heading.markdown", "@markup.heading", "Title"),
		mdHeading6 = pick("@markup.heading.6.markdown", "@markup.heading.markdown", "@markup.heading", "Title"),
		mdHr = pick("@punctuation.special.markdown", "@punctuation.special", "Special"),
		mdItalic = pick("@markup.italic.markdown", "@markup.italic"),
		optionActive = bg("PmenuSel"),
		optionDesc = fg("PmenuExtra", "Pmenu"),
		optionName = fg("PmenuKind", "Pmenu"),
		diffAdd = pick("DiffAdd"),
		diffDel = pick("DiffDelete"),
		diffContext = pick("DiffText"),
	}
end

M.init()
M.build()
