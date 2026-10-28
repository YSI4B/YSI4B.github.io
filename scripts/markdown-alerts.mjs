const titles = {
  NOTE: "Note",
  TIP: "Tip",
  IMPORTANT: "Important",
  WARNING: "Warning",
  CAUTION: "Caution"
};

// GitHub-style alerts are blockquotes whose first line is an alert marker.
export default function alerts(md) {
  md.core.ruler.after("inline", "github_alerts", (state) => {
    const tokens = state.tokens;
    for (let i = tokens.length - 3; i >= 0; i--) {
      if (tokens[i].type !== "blockquote_open" || tokens[i + 1].type !== "paragraph_open" || tokens[i + 2].type !== "inline") continue;
      const inline = tokens[i + 2];
      const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\n|$)/.exec(inline.content);
      if (!match) continue;

      const type = match[1];
      tokens[i].attrJoin("class", `markdown-alert markdown-alert-${type.toLowerCase()}`);
      tokens[i].meta = { ...tokens[i].meta, alertTitle: titles[type] };
      inline.content = inline.content.slice(match[0].length);
      const children = inline.children;
      if (children?.[0]?.type === "text") {
        children[0].content = children[0].content.slice(type.length + 3);
        if (!children[0].content) children.shift();
        if (children[0]?.type === "softbreak" || children[0]?.type === "hardbreak") children.shift();
      }
      if (!inline.content && tokens[i + 3]?.type === "paragraph_close") tokens.splice(i + 1, 3);
    }
  });

  const renderOpen = md.renderer.rules.blockquote_open || ((tokens, index, options, env, self) => self.renderToken(tokens, index, options));
  md.renderer.rules.blockquote_open = (tokens, index, options, env, self) => {
    const opening = renderOpen(tokens, index, options, env, self);
    const title = tokens[index].meta?.alertTitle;
    return title ? `${opening}<p class="markdown-alert-title">${title}</p>\n` : opening;
  };
}
