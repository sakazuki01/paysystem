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
    unimplemented!()
}

/// Lookalike skeleton of an already-normalized name. Order matters; see PAY_SYSTEM_LOGIC.md.
pub fn skeleton(normalized: &str) -> String {
    unimplemented!()
}

/// Returns `(normalized, skeleton)` or the reason the name is rejected.
pub fn validate(input: &str) -> Result<(String, String), UsernameError> {
    unimplemented!()
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
