pub fn convert(latex: &str, display: bool) -> Result<String, String> {
    let tokens = tokenize(latex);
    let nodes = parse(&tokens)?;
    let inner = nodes_to_mathml(&nodes);
    if display {
        Ok(format!("<math xmlns=\"http://www.w3.org/1998/Math/MathML\" display=\"block\"><mrow>{inner}</mrow></math>"))
    } else {
        Ok(format!(
            "<math xmlns=\"http://www.w3.org/1998/Math/MathML\"><mrow>{inner}</mrow></math>"
        ))
    }
}
#[derive(Debug, Clone, PartialEq)]
enum Token {
    Command(String),
    Text(String),
    Sup,
    Sub,
    OpenBrace,
    CloseBrace,
    Ampersand,
    Newline,
    Space,
}

fn tokenize(input: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut chars = input.chars().peekable();
    while let Some(&ch) = chars.peek() {
        match ch {
            '\\' => {
                chars.next();
                if let Some(&next) = chars.peek() {
                    if next == '\\' {
                        chars.next();
                        tokens.push(Token::Newline);
                    } else if next.is_alphabetic() {
                        let mut cmd = String::new();
                        while let Some(&c) = chars.peek() {
                            if c.is_alphabetic() {
                                cmd.push(c);
                                chars.next();
                            } else {
                                break;
                            }
                        }
                        tokens.push(Token::Command(cmd));
                    } else {
                        let c = chars.next().unwrap();
                        tokens.push(Token::Text(c.to_string()));
                    }
                }
            }
            '^' => {
                chars.next();
                tokens.push(Token::Sup);
            }
            '_' => {
                chars.next();
                tokens.push(Token::Sub);
            }
            '{' => {
                chars.next();
                tokens.push(Token::OpenBrace);
            }
            '}' => {
                chars.next();
                tokens.push(Token::CloseBrace);
            }
            '&' => {
                chars.next();
                tokens.push(Token::Ampersand);
            }
            ' ' | '\t' | '\n' | '\r' => {
                chars.next();
                tokens.push(Token::Space);
            }
            _ => {
                chars.next();
                let mut text = ch.to_string();
                while let Some(&c) = chars.peek() {
                    if "\\^_{}& \t\n\r".contains(c) {
                        break;
                    }
                    text.push(c);
                    chars.next();
                }
                tokens.push(Token::Text(text));
            }
        }
    }
    tokens
}

#[derive(Debug, Clone)]
enum MathNode {
    Identifier(String),
    Number(String),
    Operator(String),
    Space,
    Sup(Box<MathNode>, Box<MathNode>),
    Sub(Box<MathNode>, Box<MathNode>),
    SubSup(Box<MathNode>, Box<MathNode>, Box<MathNode>),
    Frac(Box<MathNode>, Box<MathNode>),
    Sqrt(Box<MathNode>),
    Group(Vec<MathNode>),
    Text(String),
}

struct ParseState<'a> {
    tokens: &'a [Token],
    pos: usize,
}

impl<'a> ParseState<'a> {
    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }
    fn next(&mut self) -> Option<&Token> {
        let t = self.tokens.get(self.pos);
        if t.is_some() {
            self.pos += 1;
        }
        t
    }
}

fn parse(tokens: &[Token]) -> Result<Vec<MathNode>, String> {
    let mut state = ParseState { tokens, pos: 0 };
    parse_sequence(&mut state, false)
}

fn parse_sequence(state: &mut ParseState, in_group: bool) -> Result<Vec<MathNode>, String> {
    let mut nodes: Vec<MathNode> = Vec::new();
    while let Some(token) = state.peek() {
        match token {
            Token::CloseBrace => {
                if in_group {
                    break;
                }
                state.next();
            }
            Token::OpenBrace => {
                state.next();
                let inner = parse_sequence(state, true)?;
                if state.peek() == Some(&Token::CloseBrace) {
                    state.next();
                }
                nodes.push(MathNode::Group(inner));
            }
            Token::Sup => {
                state.next();
                let base = nodes.pop().unwrap_or(MathNode::Identifier(String::new()));
                let sup = parse_single_node(state)?;
                if state.peek() == Some(&Token::Sub) {
                    state.next();
                    let sub = parse_single_node(state)?;
                    nodes.push(MathNode::SubSup(
                        Box::new(base),
                        Box::new(sub),
                        Box::new(sup),
                    ));
                } else {
                    nodes.push(MathNode::Sup(Box::new(base), Box::new(sup)));
                }
            }
            Token::Sub => {
                state.next();
                let base = nodes.pop().unwrap_or(MathNode::Identifier(String::new()));
                let sub = parse_single_node(state)?;
                if state.peek() == Some(&Token::Sup) {
                    state.next();
                    let sup = parse_single_node(state)?;
                    nodes.push(MathNode::SubSup(
                        Box::new(base),
                        Box::new(sub),
                        Box::new(sup),
                    ));
                } else {
                    nodes.push(MathNode::Sub(Box::new(base), Box::new(sub)));
                }
            }
            Token::Command(cmd) => {
                let cmd = cmd.clone();
                state.next();
                let node = parse_command(state, &cmd)?;
                nodes.push(node);
            }
            Token::Text(t) => {
                let t = t.clone();
                state.next();
                nodes.push(classify_text(&t));
            }
            Token::Space => {
                state.next();
                nodes.push(MathNode::Space);
            }
            Token::Ampersand | Token::Newline => {
                state.next();
            }
        }
    }
    Ok(nodes)
}

fn parse_single_node(state: &mut ParseState) -> Result<MathNode, String> {
    match state.peek() {
        Some(Token::OpenBrace) => {
            state.next();
            let inner = parse_sequence(state, true)?;
            if state.peek() == Some(&Token::CloseBrace) {
                state.next();
            }
            Ok(MathNode::Group(inner))
        }
        Some(Token::Command(cmd)) => {
            let cmd = cmd.clone();
            state.next();
            parse_command(state, &cmd)
        }
        Some(Token::Text(t)) => {
            let t = t.clone();
            state.next();
            if t.len() > 1 {
                Ok(classify_text(&t[..1]))
            } else {
                Ok(classify_text(&t))
            }
        }
        _ => {
            state.next();
            Ok(MathNode::Identifier(String::new()))
        }
    }
}

fn parse_command(state: &mut ParseState, cmd: &str) -> Result<MathNode, String> {
    match cmd {
        "frac" => {
            let num = parse_single_node(state)?;
            let den = parse_single_node(state)?;
            Ok(MathNode::Frac(Box::new(num), Box::new(den)))
        }
        "sqrt" => {
            let inner = parse_single_node(state)?;
            Ok(MathNode::Sqrt(Box::new(inner)))
        }
        "text" | "mathrm" | "textrm" => {
            let inner = parse_single_node(state)?;
            let text = extract_text(&inner);
            Ok(MathNode::Text(text))
        }
        "left" | "right" | "big" | "Big" | "bigg" | "Bigg" => {
            if let Some(Token::Text(t)) = state.peek() {
                let t = t.clone();
                state.next();
                Ok(MathNode::Operator(t))
            } else {
                Ok(MathNode::Space)
            }
        }
        "sum" => Ok(MathNode::Operator("\u{2211}".to_string())),
        "prod" => Ok(MathNode::Operator("\u{220F}".to_string())),
        "int" => Ok(MathNode::Operator("\u{222B}".to_string())),
        "infty" => Ok(MathNode::Identifier("\u{221E}".to_string())),
        "partial" => Ok(MathNode::Operator("\u{2202}".to_string())),
        "nabla" => Ok(MathNode::Operator("\u{2207}".to_string())),
        "pm" => Ok(MathNode::Operator("\u{00B1}".to_string())),
        "mp" => Ok(MathNode::Operator("\u{2213}".to_string())),
        "times" => Ok(MathNode::Operator("\u{00D7}".to_string())),
        "div" => Ok(MathNode::Operator("\u{00F7}".to_string())),
        "cdot" => Ok(MathNode::Operator("\u{22C5}".to_string())),
        "cdots" => Ok(MathNode::Operator("\u{22EF}".to_string())),
        "ldots" | "dots" => Ok(MathNode::Operator("\u{2026}".to_string())),
        "leq" | "le" => Ok(MathNode::Operator("\u{2264}".to_string())),
        "geq" | "ge" => Ok(MathNode::Operator("\u{2265}".to_string())),
        "neq" | "ne" => Ok(MathNode::Operator("\u{2260}".to_string())),
        "approx" => Ok(MathNode::Operator("\u{2248}".to_string())),
        "equiv" => Ok(MathNode::Operator("\u{2261}".to_string())),
        "in" => Ok(MathNode::Operator("\u{2208}".to_string())),
        "notin" => Ok(MathNode::Operator("\u{2209}".to_string())),
        "subset" => Ok(MathNode::Operator("\u{2282}".to_string())),
        "supset" => Ok(MathNode::Operator("\u{2283}".to_string())),
        "cup" => Ok(MathNode::Operator("\u{222A}".to_string())),
        "cap" => Ok(MathNode::Operator("\u{2229}".to_string())),
        "forall" => Ok(MathNode::Operator("\u{2200}".to_string())),
        "exists" => Ok(MathNode::Operator("\u{2203}".to_string())),
        "to" | "rightarrow" => Ok(MathNode::Operator("\u{2192}".to_string())),
        "leftarrow" => Ok(MathNode::Operator("\u{2190}".to_string())),
        "Rightarrow" => Ok(MathNode::Operator("\u{21D2}".to_string())),
        "Leftarrow" => Ok(MathNode::Operator("\u{21D0}".to_string())),
        "langle" => Ok(MathNode::Operator("\u{27E8}".to_string())),
        "rangle" => Ok(MathNode::Operator("\u{27E9}".to_string())),
        "quad" => Ok(MathNode::Space),
        "qquad" => Ok(MathNode::Space),
        _ => {
            if let Some(greek) = greek_letter(cmd) {
                Ok(MathNode::Identifier(greek.to_string()))
            } else {
                Ok(MathNode::Identifier(cmd.to_string()))
            }
        }
    }
}

fn greek_letter(cmd: &str) -> Option<&'static str> {
    match cmd {
        "alpha" => Some("\u{03B1}"),
        "beta" => Some("\u{03B2}"),
        "gamma" => Some("\u{03B3}"),
        "delta" => Some("\u{03B4}"),
        "epsilon" | "varepsilon" => Some("\u{03B5}"),
        "zeta" => Some("\u{03B6}"),
        "eta" => Some("\u{03B7}"),
        "theta" | "vartheta" => Some("\u{03B8}"),
        "iota" => Some("\u{03B9}"),
        "kappa" => Some("\u{03BA}"),
        "lambda" => Some("\u{03BB}"),
        "mu" => Some("\u{03BC}"),
        "nu" => Some("\u{03BD}"),
        "xi" => Some("\u{03BE}"),
        "pi" | "varpi" => Some("\u{03C0}"),
        "rho" | "varrho" => Some("\u{03C1}"),
        "sigma" | "varsigma" => Some("\u{03C3}"),
        "tau" => Some("\u{03C4}"),
        "upsilon" => Some("\u{03C5}"),
        "phi" | "varphi" => Some("\u{03C6}"),
        "chi" => Some("\u{03C7}"),
        "psi" => Some("\u{03C8}"),
        "omega" => Some("\u{03C9}"),
        "Gamma" => Some("\u{0393}"),
        "Delta" => Some("\u{0394}"),
        "Theta" => Some("\u{0398}"),
        "Lambda" => Some("\u{039B}"),
        "Xi" => Some("\u{039E}"),
        "Pi" => Some("\u{03A0}"),
        "Sigma" => Some("\u{03A3}"),
        "Upsilon" => Some("\u{03A5}"),
        "Phi" => Some("\u{03A6}"),
        "Psi" => Some("\u{03A8}"),
        "Omega" => Some("\u{03A9}"),
        _ => None,
    }
}

fn classify_text(t: &str) -> MathNode {
    if t.chars().all(|c| c.is_ascii_digit() || c == '.') {
        MathNode::Number(t.to_string())
    } else if t.len() == 1 && "+-=<>()[]|/!,;:.".contains(t) {
        MathNode::Operator(t.to_string())
    } else {
        MathNode::Identifier(t.to_string())
    }
}

fn extract_text(node: &MathNode) -> String {
    match node {
        MathNode::Identifier(s)
        | MathNode::Number(s)
        | MathNode::Operator(s)
        | MathNode::Text(s) => s.clone(),
        MathNode::Group(nodes) => nodes.iter().map(extract_text).collect::<Vec<_>>().join(""),
        _ => String::new(),
    }
}

fn escape_xml(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(ch),
        }
    }
    out
}

fn nodes_to_mathml(nodes: &[MathNode]) -> String {
    nodes
        .iter()
        .map(node_to_mathml)
        .collect::<Vec<_>>()
        .join("")
}

fn node_to_mathml(node: &MathNode) -> String {
    match node {
        MathNode::Identifier(s) => format!("<mi>{}</mi>", escape_xml(s)),
        MathNode::Number(s) => format!("<mn>{}</mn>", escape_xml(s)),
        MathNode::Operator(s) => format!("<mo>{}</mo>", escape_xml(s)),
        MathNode::Space => "<mspace width=\"1em\"/>".to_string(),
        MathNode::Text(s) => format!("<mtext>{}</mtext>", escape_xml(s)),
        MathNode::Sup(base, sup) => {
            format!(
                "<msup>{}{}</msup>",
                node_to_mathml(base),
                node_to_mathml(sup)
            )
        }
        MathNode::Sub(base, sub) => {
            format!(
                "<msub>{}{}</msub>",
                node_to_mathml(base),
                node_to_mathml(sub)
            )
        }
        MathNode::SubSup(base, sub, sup) => {
            format!(
                "<msubsup>{}{}{}</msubsup>",
                node_to_mathml(base),
                node_to_mathml(sub),
                node_to_mathml(sup)
            )
        }
        MathNode::Frac(num, den) => {
            format!(
                "<mfrac>{}{}</mfrac>",
                node_to_mathml(num),
                node_to_mathml(den)
            )
        }
        MathNode::Sqrt(inner) => {
            format!("<msqrt>{}</msqrt>", node_to_mathml(inner))
        }
        MathNode::Group(nodes) => {
            format!("<mrow>{}</mrow>", nodes_to_mathml(nodes))
        }
    }
}
