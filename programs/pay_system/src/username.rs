//! Username rules enforced on-chain.
//! Must stay identical to packages/shared/src/username.ts;
//! both are tested against shared/username-vectors.json.

pub const MIN_LEN: usize = 3;
pub const MAX_LEN: usize = 20;

pub const RESERVED_USERNAMES: [&str; 14] = [
    "admin", "support", "help", "official", "solana", "telegram", "paysystem",
    "pay_system", "wallet", "root", "system", "mod", "moderator", "usdc",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UsernameError {
    Invalid,
    Reserved,
}

/// Lowercase ASCII letters only. Non-ASCII is left as-is so validation rejects it.
pub fn normalize(input: &str) -> String {
    input.to_ascii_lowercase()
}

/// Lookalike skeleton of an already-normalized name. Order matters; see PAY_SYSTEM_LOGIC.md.
pub fn skeleton(normalized: &str) -> String {
    // 1. drop underscores
    let chars: Vec<char> = normalized.chars().filter(|&c| c != '_').collect();
    // 2. "rn" -> "m", single left-to-right pass
    let mut replaced = Vec::with_capacity(chars.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == 'r' && chars.get(i + 1) == Some(&'n') {
            replaced.push('m');
            i += 2;
        } else {
            replaced.push(chars[i]);
            i += 1;
        }
    }
    // 3. single-character map, then 4. collapse runs
    let mut out = String::with_capacity(replaced.len());
    for c in replaced {
        let mapped = match c {
            '0' => 'o',
            '1' | 'i' => 'l',
            '5' => 's',
            '3' => 'e',
            '8' => 'b',
            other => other,
        };
        if !out.ends_with(mapped) {
            out.push(mapped);
        }
    }
    out
}

/// Returns `(normalized, skeleton)` or the reason the name is rejected.
pub fn validate(input: &str) -> Result<(String, String), UsernameError> {
    let normalized = normalize(input);
    let len = normalized.len();
    let charset_ok = normalized
        .bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_');
    if !(MIN_LEN..=MAX_LEN).contains(&len) || !charset_ok {
        return Err(UsernameError::Invalid);
    }
    if RESERVED_USERNAMES.contains(&normalized.as_str()) {
        return Err(UsernameError::Reserved);
    }
    let skel = skeleton(&normalized);
    Ok((normalized, skel))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn vectors() -> Value {
        serde_json::from_str(include_str!("../../../shared/username-vectors.json")).unwrap()
    }

    #[test]
    fn reserved_list_matches_fixture() {
        let v = vectors();
        let mut fixture: Vec<&str> = v["reserved"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s.as_str().unwrap())
            .collect();
        let mut ours = RESERVED_USERNAMES.to_vec();
        fixture.sort();
        ours.sort();
        assert_eq!(ours, fixture);
    }

    #[test]
    fn valid_vectors() {
        for case in vectors()["valid"].as_array().unwrap() {
            let input = case["input"].as_str().unwrap();
            let normalized = case["normalized"].as_str().unwrap();
            let skel = case["skeleton"].as_str().unwrap();
            assert_eq!(normalize(input), normalized, "normalize({input:?})");
            assert_eq!(skeleton(normalized), skel, "skeleton({normalized:?})");
            assert_eq!(
                validate(input),
                Ok((normalized.to_string(), skel.to_string())),
                "validate({input:?})"
            );
        }
    }

    #[test]
    fn invalid_vectors() {
        for case in vectors()["invalid"].as_array().unwrap() {
            let input = case["input"].as_str().unwrap();
            let expected = match case["error"].as_str().unwrap() {
                "InvalidUsername" => UsernameError::Invalid,
                "ReservedUsername" => UsernameError::Reserved,
                other => panic!("unknown error {other}"),
            };
            assert_eq!(validate(input), Err(expected), "validate({input:?})");
        }
    }
}
