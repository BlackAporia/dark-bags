//! The DARK BAGS vault: where the game's private money lives on Starknet.
//!
//! It is plugged into the STRK20 privacy pool the same way StarkWare's own anonymizers are
//! (see `ekubo_swap_anonymizer` in starkware-libs/starknet-privacy): the pool calls
//! `privacy_invoke` on it inside a private transaction, after the private actions ran.
//!
//! - **Private deposit.** The player's wallet sends one STRK20 transaction: `withdraw` from their
//!   shielded notes to this vault, then `invoke` it with `DEPOSIT` and a one-time reference the game
//!   server handed them. On chain: "someone paid the vault X for reference R". The sender stays
//!   encrypted inside the pool, and R is random, so nobody can tell which wallet or which player it
//!   was. The server credits the player who asked for R.
//! - **Private cash-out.** The game server (the operator) sends one STRK20 transaction: it creates an
//!   open note owned by the player (the owner is encrypted on chain), then invokes this vault with
//!   `PAYOUT`. The vault checks the operator's signature over the note ids and amounts and returns
//!   the deposits; the pool pulls the funds from the vault into the player's note. The winnings land
//!   in the player's shielded balance and nobody can see whose note it was.
//! - **Private stakes.** A staked match locks its whole pot here (`open_match`) and releases it on
//!   `settle_match`. Only the pot per coin ever reaches the chain, never who staked what. The house
//!   cut is taken here and is capped by the contract at `MAX_RAKE_BPS` (5%). Each match also records
//!   a `result_root`: a Poseidon hash over every player's (salt, stake, payout), so a player who was
//!   given their own leaf can check their stake was counted, without anyone else learning it.
//!
//! Trust: the game is custodial (the server decides who won), and the operator can move free funds
//! to the house wallet to pay public cash-outs. What the contract guarantees is that the money flows
//! privately through STRK20, that a locked pot cannot be raked above 5%, and that every payout was
//! signed by the operator key.

use starknet::ContractAddress;

/// What the pool applies after `privacy_invoke`: fill open note `note_id` with `amount` of `token`
/// (same layout as `privacy::objects::OpenNoteDeposit`).
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct OpenNoteDeposit {
    pub note_id: felt252,
    pub token: ContractAddress,
    pub amount: u128,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct TokenAmount {
    pub token: ContractAddress,
    pub amount: u128,
}

/// `privacy_invoke` operations (the first calldata felt).
pub mod ops {
    pub const DEPOSIT: felt252 = 'DEPOSIT';
    pub const PAYOUT: felt252 = 'PAYOUT';
}

/// Domain tag of the operator's payout signature.
pub const PAYOUT_DOMAIN: felt252 = 'DARKBAGS_PAYOUT_V1';
/// The house cut on a pot can never be more than this (basis points).
pub const MAX_RAKE_BPS: u128 = 500;
pub const MAX_PAYOUT_NOTES: u32 = 16;

pub mod match_state {
    pub const NONE: u8 = 0;
    pub const OPEN: u8 = 1;
    pub const SETTLED: u8 = 2;
    pub const VOIDED: u8 = 3;
}

pub mod errors {
    pub const NOT_POOL: felt252 = 'VAULT: caller is not the pool';
    pub const NOT_OPERATOR: felt252 = 'VAULT: not the operator';
    pub const NOT_OWNER: felt252 = 'VAULT: not the owner';
    pub const PAUSED: felt252 = 'VAULT: paused';
    pub const BAD_OP: felt252 = 'VAULT: unknown op';
    pub const BAD_DATA: felt252 = 'VAULT: malformed calldata';
    pub const ZERO_AMOUNT: felt252 = 'VAULT: zero amount';
    pub const ZERO_REF: felt252 = 'VAULT: zero reference';
    pub const NOT_RECEIVED: felt252 = 'VAULT: funds not received';
    pub const PAYOUT_USED: felt252 = 'VAULT: payout already used';
    pub const BAD_SIGNATURE: felt252 = 'VAULT: bad operator signature';
    pub const TOO_MANY_NOTES: felt252 = 'VAULT: too many notes';
    pub const NOT_ENOUGH_FREE: felt252 = 'VAULT: not enough free funds';
    pub const MATCH_EXISTS: felt252 = 'VAULT: match already exists';
    pub const MATCH_NOT_OPEN: felt252 = 'VAULT: match is not open';
    pub const RAKE_TOO_HIGH: felt252 = 'VAULT: rake above the cap';
    pub const RAKE_MISMATCH: felt252 = 'VAULT: rakes do not match pots';
    pub const EMPTY_POT: felt252 = 'VAULT: empty pot';
    pub const DUP_TOKEN: felt252 = 'VAULT: token listed twice';
    pub const TRANSFER_FAILED: felt252 = 'VAULT: transfer failed';
    pub const ZERO_ADDRESS: felt252 = 'VAULT: zero address';
}

#[starknet::interface]
pub trait IERC20<T> {
    fn balance_of(self: @T, account: ContractAddress) -> u256;
    fn transfer(ref self: T, recipient: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: T, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
    fn approve(ref self: T, spender: ContractAddress, amount: u256) -> bool;
}

#[starknet::interface]
pub trait IDarkBagsVault<T> {
    /// Called by the STRK20 pool only (selector `privacy_invoke`).
    /// `DEPOSIT`: data = [token, amount, reference]. Returns no deposits.
    /// `PAYOUT`:  data = [payout_id, token, n, (note_id, amount) × n, sig_r, sig_s]. Returns the n
    /// open-note deposits for the pool to apply.
    fn privacy_invoke(ref self: T, op: felt252, data: Span<felt252>) -> Span<OpenNoteDeposit>;

    /// Operator: lock a staked match's whole pot, per coin. No player data.
    fn open_match(ref self: T, match_id: felt252, pots: Span<TokenAmount>);
    /// Operator: release the pot, sending the house cut (≤ 5% per coin) to the treasury.
    /// `rakes` lists the same coins in the same order as `open_match`.
    fn settle_match(
        ref self: T, match_id: felt252, rakes: Span<TokenAmount>, result_root: felt252,
    );
    /// Operator: cancel a match (nobody played): the pot is released, no cut.
    fn void_match(ref self: T, match_id: felt252);

    /// Anyone (the house, in practice): add funds from the caller (needs an allowance).
    fn fund(ref self: T, token: ContractAddress, amount: u128);
    /// Operator: move free funds to the house wallet (to pay public cash-outs).
    fn sweep(ref self: T, token: ContractAddress, amount: u128);

    fn set_operator(ref self: T, operator: ContractAddress, operator_key: felt252);
    fn set_treasury(ref self: T, treasury: ContractAddress);
    fn set_paused(ref self: T, paused: bool);
    fn transfer_ownership(ref self: T, new_owner: ContractAddress);

    fn pool(self: @T) -> ContractAddress;
    fn owner(self: @T) -> ContractAddress;
    fn operator(self: @T) -> ContractAddress;
    fn operator_key(self: @T) -> felt252;
    fn treasury(self: @T) -> ContractAddress;
    fn is_paused(self: @T) -> bool;
    /// Funds the vault owes and has not locked in a match.
    fn free_balance(self: @T, token: ContractAddress) -> u128;
    fn locked(self: @T, token: ContractAddress) -> u128;
    fn match_state(self: @T, match_id: felt252) -> u8;
    fn match_pot(self: @T, match_id: felt252, token: ContractAddress) -> u128;
    fn payout_used(self: @T, payout_id: felt252) -> bool;
    /// The hash the operator signs for a payout (the server computes the same).
    fn payout_hash(
        self: @T, payout_id: felt252, token: ContractAddress, notes: Span<OpenNoteDeposit>,
    ) -> felt252;
}

#[starknet::contract]
pub mod DarkBagsVault {
    use core::ecdsa::check_ecdsa_signature;
    use core::num::traits::Zero;
    use core::poseidon::poseidon_hash_span;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address, get_contract_address, get_tx_info};
    use super::{
        IDarkBagsVault, IERC20Dispatcher, IERC20DispatcherTrait, MAX_PAYOUT_NOTES, MAX_RAKE_BPS,
        OpenNoteDeposit, PAYOUT_DOMAIN, TokenAmount, errors, match_state, ops,
    };

    #[storage]
    struct Storage {
        pool: ContractAddress,
        owner: ContractAddress,
        operator: ContractAddress,
        operator_key: felt252,
        treasury: ContractAddress,
        paused: bool,
        // what the vault knows it holds, per token (inflows not yet claimed are not counted)
        accounted: Map<ContractAddress, u128>,
        // part of `accounted` locked in open matches
        locked: Map<ContractAddress, u128>,
        payout_used: Map<felt252, bool>,
        match_state: Map<felt252, u8>,
        match_count: Map<felt252, u32>,
        match_token: Map<(felt252, u32), ContractAddress>,
        match_pot: Map<(felt252, ContractAddress), u128>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Deposited: Deposited,
        PaidOut: PaidOut,
        MatchOpened: MatchOpened,
        MatchSettled: MatchSettled,
        MatchVoided: MatchVoided,
        Funded: Funded,
        Swept: Swept,
        OperatorSet: OperatorSet,
        TreasurySet: TreasurySet,
        PausedSet: PausedSet,
        OwnershipTransferred: OwnershipTransferred,
    }

    /// A private deposit: the payer is hidden in the pool; `reference` is a one-time random id.
    #[derive(Drop, starknet::Event)]
    pub struct Deposited {
        #[key]
        pub reference: felt252,
        #[key]
        pub token: ContractAddress,
        pub amount: u128,
    }

    /// A private cash-out into `notes` open notes whose owners are encrypted.
    #[derive(Drop, starknet::Event)]
    pub struct PaidOut {
        #[key]
        pub payout_id: felt252,
        #[key]
        pub token: ContractAddress,
        pub total: u128,
        pub notes: u32,
    }

    #[derive(Drop, starknet::Event)]
    pub struct MatchOpened {
        #[key]
        pub match_id: felt252,
        #[key]
        pub token: ContractAddress,
        pub pot: u128,
    }

    #[derive(Drop, starknet::Event)]
    pub struct MatchSettled {
        #[key]
        pub match_id: felt252,
        #[key]
        pub token: ContractAddress,
        pub pot: u128,
        pub rake: u128,
        pub result_root: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct MatchVoided {
        #[key]
        pub match_id: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Funded {
        #[key]
        pub token: ContractAddress,
        pub from: ContractAddress,
        pub amount: u128,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Swept {
        #[key]
        pub token: ContractAddress,
        pub to: ContractAddress,
        pub amount: u128,
    }

    #[derive(Drop, starknet::Event)]
    pub struct OperatorSet {
        pub operator: ContractAddress,
        pub operator_key: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TreasurySet {
        pub treasury: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct PausedSet {
        pub paused: bool,
    }

    #[derive(Drop, starknet::Event)]
    pub struct OwnershipTransferred {
        pub owner: ContractAddress,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        pool: ContractAddress,
        owner: ContractAddress,
        operator: ContractAddress,
        operator_key: felt252,
        treasury: ContractAddress,
    ) {
        assert(pool.is_non_zero(), errors::ZERO_ADDRESS);
        assert(owner.is_non_zero(), errors::ZERO_ADDRESS);
        assert(operator.is_non_zero(), errors::ZERO_ADDRESS);
        assert(treasury.is_non_zero(), errors::ZERO_ADDRESS);
        self.pool.write(pool);
        self.owner.write(owner);
        self.operator.write(operator);
        self.operator_key.write(operator_key);
        self.treasury.write(treasury);
    }

    #[abi(embed_v0)]
    impl VaultImpl of IDarkBagsVault<ContractState> {
        fn privacy_invoke(
            ref self: ContractState, op: felt252, data: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            assert(get_caller_address() == self.pool.read(), errors::NOT_POOL);
            assert(!self.paused.read(), errors::PAUSED);
            if op == ops::DEPOSIT {
                self._deposit(data);
                array![].span()
            } else if op == ops::PAYOUT {
                self._payout(data)
            } else {
                core::panic_with_felt252(errors::BAD_OP)
            }
        }

        fn open_match(ref self: ContractState, match_id: felt252, pots: Span<TokenAmount>) {
            self._only_operator();
            assert(!self.paused.read(), errors::PAUSED);
            assert(self.match_state.read(match_id) == match_state::NONE, errors::MATCH_EXISTS);
            assert(!pots.is_empty(), errors::EMPTY_POT);
            let mut i: u32 = 0;
            for pot in pots {
                let TokenAmount { token, amount } = *pot;
                assert(amount.is_non_zero(), errors::EMPTY_POT);
                assert(self.match_pot.read((match_id, token)).is_zero(), errors::DUP_TOKEN);
                assert(self._free(token) >= amount, errors::NOT_ENOUGH_FREE);
                self.locked.write(token, self.locked.read(token) + amount);
                self.match_pot.write((match_id, token), amount);
                self.match_token.write((match_id, i), token);
                self.emit(MatchOpened { match_id, token, pot: amount });
                i += 1;
            }
            self.match_count.write(match_id, i);
            self.match_state.write(match_id, match_state::OPEN);
        }

        fn settle_match(
            ref self: ContractState,
            match_id: felt252,
            rakes: Span<TokenAmount>,
            result_root: felt252,
        ) {
            self._only_operator();
            assert(self.match_state.read(match_id) == match_state::OPEN, errors::MATCH_NOT_OPEN);
            let count = self.match_count.read(match_id);
            assert(rakes.len() == count, errors::RAKE_MISMATCH);
            let treasury = self.treasury.read();
            let mut i: u32 = 0;
            for rake in rakes {
                let TokenAmount { token, amount: cut } = *rake;
                assert(self.match_token.read((match_id, i)) == token, errors::RAKE_MISMATCH);
                let pot = self.match_pot.read((match_id, token));
                // the cap: cut * 10000 <= pot * MAX_RAKE_BPS, in u256 so nothing overflows
                let lhs: u256 = cut.into() * 10000;
                let rhs: u256 = pot.into() * MAX_RAKE_BPS.into();
                assert(lhs <= rhs, errors::RAKE_TOO_HIGH);
                self.locked.write(token, self.locked.read(token) - pot);
                if cut.is_non_zero() {
                    self.accounted.write(token, self.accounted.read(token) - cut);
                    self._send(token, treasury, cut);
                }
                self.emit(MatchSettled { match_id, token, pot, rake: cut, result_root });
                i += 1;
            }
            self.match_state.write(match_id, match_state::SETTLED);
        }

        fn void_match(ref self: ContractState, match_id: felt252) {
            self._only_operator();
            assert(self.match_state.read(match_id) == match_state::OPEN, errors::MATCH_NOT_OPEN);
            let count = self.match_count.read(match_id);
            let mut i: u32 = 0;
            while i != count {
                let token = self.match_token.read((match_id, i));
                let pot = self.match_pot.read((match_id, token));
                self.locked.write(token, self.locked.read(token) - pot);
                i += 1;
            }
            self.match_state.write(match_id, match_state::VOIDED);
            self.emit(MatchVoided { match_id });
        }

        fn fund(ref self: ContractState, token: ContractAddress, amount: u128) {
            assert(amount.is_non_zero(), errors::ZERO_AMOUNT);
            let from = get_caller_address();
            let ok = IERC20Dispatcher { contract_address: token }
                .transfer_from(from, get_contract_address(), amount.into());
            assert(ok, errors::TRANSFER_FAILED);
            self.accounted.write(token, self.accounted.read(token) + amount);
            self.emit(Funded { token, from, amount });
        }

        fn sweep(ref self: ContractState, token: ContractAddress, amount: u128) {
            self._only_operator();
            assert(amount.is_non_zero(), errors::ZERO_AMOUNT);
            assert(self._free(token) >= amount, errors::NOT_ENOUGH_FREE);
            let to = self.operator.read();
            self.accounted.write(token, self.accounted.read(token) - amount);
            self._send(token, to, amount);
            self.emit(Swept { token, to, amount });
        }

        fn set_operator(ref self: ContractState, operator: ContractAddress, operator_key: felt252) {
            self._only_owner();
            assert(operator.is_non_zero(), errors::ZERO_ADDRESS);
            self.operator.write(operator);
            self.operator_key.write(operator_key);
            self.emit(OperatorSet { operator, operator_key });
        }

        fn set_treasury(ref self: ContractState, treasury: ContractAddress) {
            self._only_owner();
            assert(treasury.is_non_zero(), errors::ZERO_ADDRESS);
            self.treasury.write(treasury);
            self.emit(TreasurySet { treasury });
        }

        fn set_paused(ref self: ContractState, paused: bool) {
            self._only_owner();
            self.paused.write(paused);
            self.emit(PausedSet { paused });
        }

        fn transfer_ownership(ref self: ContractState, new_owner: ContractAddress) {
            self._only_owner();
            assert(new_owner.is_non_zero(), errors::ZERO_ADDRESS);
            self.owner.write(new_owner);
            self.emit(OwnershipTransferred { owner: new_owner });
        }

        fn pool(self: @ContractState) -> ContractAddress {
            self.pool.read()
        }
        fn owner(self: @ContractState) -> ContractAddress {
            self.owner.read()
        }
        fn operator(self: @ContractState) -> ContractAddress {
            self.operator.read()
        }
        fn operator_key(self: @ContractState) -> felt252 {
            self.operator_key.read()
        }
        fn treasury(self: @ContractState) -> ContractAddress {
            self.treasury.read()
        }
        fn is_paused(self: @ContractState) -> bool {
            self.paused.read()
        }
        fn free_balance(self: @ContractState, token: ContractAddress) -> u128 {
            self._free(token)
        }
        fn locked(self: @ContractState, token: ContractAddress) -> u128 {
            self.locked.read(token)
        }
        fn match_state(self: @ContractState, match_id: felt252) -> u8 {
            self.match_state.read(match_id)
        }
        fn match_pot(self: @ContractState, match_id: felt252, token: ContractAddress) -> u128 {
            self.match_pot.read((match_id, token))
        }
        fn payout_used(self: @ContractState, payout_id: felt252) -> bool {
            self.payout_used.read(payout_id)
        }
        fn payout_hash(
            self: @ContractState,
            payout_id: felt252,
            token: ContractAddress,
            notes: Span<OpenNoteDeposit>,
        ) -> felt252 {
            let mut msg = array![
                PAYOUT_DOMAIN, get_tx_info().unbox().chain_id, get_contract_address().into(),
                payout_id, token.into(), notes.len().into(),
            ];
            for n in notes {
                msg.append(*n.note_id);
                msg.append((*n.amount).into());
            }
            poseidon_hash_span(msg.span())
        }
    }

    #[generate_trait]
    impl Internal of InternalTrait {
        fn _only_operator(self: @ContractState) {
            assert(get_caller_address() == self.operator.read(), errors::NOT_OPERATOR);
        }

        fn _only_owner(self: @ContractState) {
            assert(get_caller_address() == self.owner.read(), errors::NOT_OWNER);
        }

        fn _free(self: @ContractState, token: ContractAddress) -> u128 {
            self.accounted.read(token) - self.locked.read(token)
        }

        fn _send(ref self: ContractState, token: ContractAddress, to: ContractAddress, amount: u128) {
            let ok = IERC20Dispatcher { contract_address: token }.transfer(to, amount.into());
            assert(ok, errors::TRANSFER_FAILED);
        }

        // [token, amount, reference]: the pool's Withdraw already moved `amount` here in this tx
        fn _deposit(ref self: ContractState, data: Span<felt252>) {
            assert(data.len() == 3, errors::BAD_DATA);
            let token: ContractAddress = (*data[0]).try_into().expect(errors::BAD_DATA);
            let amount: u128 = (*data[1]).try_into().expect(errors::BAD_DATA);
            let reference = *data[2];
            assert(amount.is_non_zero(), errors::ZERO_AMOUNT);
            assert(reference.is_non_zero(), errors::ZERO_REF);
            let accounted = self.accounted.read(token);
            let held = IERC20Dispatcher { contract_address: token }
                .balance_of(get_contract_address());
            assert(held >= accounted.into() + amount.into(), errors::NOT_RECEIVED);
            self.accounted.write(token, accounted + amount);
            self.emit(Deposited { reference, token, amount });
        }

        // [payout_id, token, n, (note_id, amount) × n, sig_r, sig_s]
        fn _payout(ref self: ContractState, data: Span<felt252>) -> Span<OpenNoteDeposit> {
            assert(data.len() >= 5, errors::BAD_DATA);
            let payout_id = *data[0];
            let token: ContractAddress = (*data[1]).try_into().expect(errors::BAD_DATA);
            let n: u32 = (*data[2]).try_into().expect(errors::BAD_DATA);
            assert(n.is_non_zero(), errors::BAD_DATA);
            assert(n <= MAX_PAYOUT_NOTES, errors::TOO_MANY_NOTES);
            assert(data.len() == 5 + 2 * n, errors::BAD_DATA);
            assert(!self.payout_used.read(payout_id), errors::PAYOUT_USED);

            let mut notes: Array<OpenNoteDeposit> = array![];
            let mut total: u128 = 0;
            let mut i: u32 = 0;
            while i != n {
                let note_id = *data[3 + 2 * i];
                let amount: u128 = (*data[4 + 2 * i]).try_into().expect(errors::BAD_DATA);
                assert(amount.is_non_zero(), errors::ZERO_AMOUNT);
                total += amount;
                notes.append(OpenNoteDeposit { note_id, token, amount });
                i += 1;
            }
            let sig_r = *data[3 + 2 * n];
            let sig_s = *data[4 + 2 * n];
            let hash = self.payout_hash(payout_id, token, notes.span());
            assert(
                check_ecdsa_signature(hash, self.operator_key.read(), sig_r, sig_s),
                errors::BAD_SIGNATURE,
            );
            assert(self._free(token) >= total, errors::NOT_ENOUGH_FREE);

            self.payout_used.write(payout_id, true);
            self.accounted.write(token, self.accounted.read(token) - total);
            // the pool pulls exactly `total` with transfer_from right after this call
            let ok = IERC20Dispatcher { contract_address: token }
                .approve(self.pool.read(), total.into());
            assert(ok, errors::TRANSFER_FAILED);
            self.emit(PaidOut { payout_id, token, total, notes: n });
            notes.span()
        }
    }
}
