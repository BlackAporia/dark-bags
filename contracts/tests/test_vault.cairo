use core::num::traits::Zero;
use dark_bags::mocks::{IMockPoolDispatcher, IMockPoolDispatcherTrait, IMockTokenDispatcher, IMockTokenDispatcherTrait};
use dark_bags::vault::{
    IDarkBagsVaultDispatcher, IDarkBagsVaultDispatcherTrait, IERC20Dispatcher,
    IERC20DispatcherTrait, OpenNoteDeposit, TokenAmount, match_state, ops,
};
use snforge_std::signature::KeyPairTrait;
use snforge_std::signature::stark_curve::{StarkCurveKeyPairImpl, StarkCurveSignerImpl};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;

const OPERATOR_SECRET: felt252 = 0x1234567890abcdef;

fn owner() -> ContractAddress {
    'owner'.try_into().unwrap()
}
fn house() -> ContractAddress {
    'house'.try_into().unwrap()
}
fn treasury() -> ContractAddress {
    'treasury'.try_into().unwrap()
}

#[derive(Copy, Drop)]
struct Setup {
    vault: IDarkBagsVaultDispatcher,
    pool: IMockPoolDispatcher,
    token: ContractAddress,
}

fn setup() -> Setup {
    let token_class = declare("MockToken").unwrap().contract_class();
    let (token, _) = token_class.deploy(@array![]).unwrap();
    let pool_class = declare("MockPool").unwrap().contract_class();
    let (pool, _) = pool_class.deploy(@array![]).unwrap();
    // the pool holds everyone's shielded funds
    IMockTokenDispatcher { contract_address: token }.mint(pool, 1_000_000);

    let key = KeyPairTrait::<felt252, felt252>::from_secret_key(OPERATOR_SECRET);
    let vault_class = declare("DarkBagsVault").unwrap().contract_class();
    let (vault, _) = vault_class
        .deploy(
            @array![pool.into(), owner().into(), house().into(), key.public_key, treasury().into()],
        )
        .unwrap();
    Setup {
        vault: IDarkBagsVaultDispatcher { contract_address: vault },
        pool: IMockPoolDispatcher { contract_address: pool },
        token,
    }
}

fn deposit(s: @Setup, amount: u128, reference: felt252) {
    let data = array![(*s.token).into(), amount.into(), reference];
    let mut calldata = array![ops::DEPOSIT];
    data.serialize(ref calldata);
    (*s.pool).withdraw_and_invoke(*s.token, amount, (*s.vault).contract_address, calldata.span());
}

fn payout_calldata(s: @Setup, payout_id: felt252, notes: Span<OpenNoteDeposit>, secret: felt252) -> Array<felt252> {
    let hash = (*s.vault).payout_hash(payout_id, *s.token, notes);
    let key = KeyPairTrait::<felt252, felt252>::from_secret_key(secret);
    let (r, sig_s) = key.sign(hash).unwrap();
    let mut data = array![payout_id, (*s.token).into(), notes.len().into()];
    for n in notes {
        data.append(*n.note_id);
        data.append((*n.amount).into());
    }
    data.append(r);
    data.append(sig_s);
    let mut calldata = array![ops::PAYOUT];
    data.serialize(ref calldata);
    calldata
}

fn balance(token: ContractAddress, who: ContractAddress) -> u256 {
    IERC20Dispatcher { contract_address: token }.balance_of(who)
}

#[test]
fn private_deposit_is_credited() {
    let s = setup();
    deposit(@s, 5000, 'ref-1');
    assert_eq!(s.vault.free_balance(s.token), 5000);
    assert_eq!(balance(s.token, s.vault.contract_address), 5000);
}

#[test]
#[should_panic(expected: 'VAULT: funds not received')]
fn deposit_without_funds_fails() {
    let s = setup();
    let mut calldata = array![ops::DEPOSIT];
    array![s.token.into(), 5000, 'ref-1'].serialize(ref calldata);
    s.pool.withdraw_and_invoke(s.token, 0, s.vault.contract_address, calldata.span());
}

#[test]
#[should_panic(expected: 'VAULT: caller is not the pool')]
fn only_the_pool_can_invoke() {
    let s = setup();
    s.vault.privacy_invoke(ops::DEPOSIT, array![s.token.into(), 1, 'x'].span());
}

#[test]
fn private_payout_fills_open_notes() {
    let s = setup();
    deposit(@s, 10_000, 'ref-1');
    let notes = array![
        OpenNoteDeposit { note_id: 0xaaa, token: s.token, amount: 3000 },
        OpenNoteDeposit { note_id: 0xbbb, token: s.token, amount: 1500 },
    ];
    let calldata = payout_calldata(@s, 'payout-1', notes.span(), OPERATOR_SECRET);
    let out = s.pool.withdraw_and_invoke(s.token, 0, s.vault.contract_address, calldata.span());
    assert_eq!(out.len(), 2);
    assert_eq!(s.pool.note_balance(0xaaa), 3000);
    assert_eq!(s.pool.note_balance(0xbbb), 1500);
    assert_eq!(s.vault.free_balance(s.token), 5500);
    assert_eq!(balance(s.token, s.vault.contract_address), 5500);
    assert!(s.vault.payout_used('payout-1'));
}

#[test]
#[should_panic(expected: 'VAULT: payout already used')]
fn payout_cannot_be_replayed() {
    let s = setup();
    deposit(@s, 10_000, 'ref-1');
    let notes = array![OpenNoteDeposit { note_id: 0xaaa, token: s.token, amount: 100 }];
    let calldata = payout_calldata(@s, 'payout-1', notes.span(), OPERATOR_SECRET);
    s.pool.withdraw_and_invoke(s.token, 0, s.vault.contract_address, calldata.span());
    s.pool.withdraw_and_invoke(s.token, 0, s.vault.contract_address, calldata.span());
}

#[test]
#[should_panic(expected: 'VAULT: bad operator signature')]
fn payout_needs_the_operator_key() {
    let s = setup();
    deposit(@s, 10_000, 'ref-1');
    let notes = array![OpenNoteDeposit { note_id: 0xaaa, token: s.token, amount: 100 }];
    let calldata = payout_calldata(@s, 'payout-1', notes.span(), 0xbad);
    s.pool.withdraw_and_invoke(s.token, 0, s.vault.contract_address, calldata.span());
}

#[test]
#[should_panic(expected: 'VAULT: not enough free funds')]
fn payout_cannot_touch_a_locked_pot() {
    let s = setup();
    deposit(@s, 1000, 'ref-1');
    start_cheat_caller_address(s.vault.contract_address, house());
    s.vault.open_match('m1', array![TokenAmount { token: s.token, amount: 800 }].span());
    stop_cheat_caller_address(s.vault.contract_address);
    let notes = array![OpenNoteDeposit { note_id: 0xaaa, token: s.token, amount: 300 }];
    let calldata = payout_calldata(@s, 'payout-1', notes.span(), OPERATOR_SECRET);
    s.pool.withdraw_and_invoke(s.token, 0, s.vault.contract_address, calldata.span());
}

#[test]
fn match_pot_is_locked_then_settled_with_capped_rake() {
    let s = setup();
    deposit(@s, 10_000, 'ref-1');
    start_cheat_caller_address(s.vault.contract_address, house());
    s.vault.open_match('m1', array![TokenAmount { token: s.token, amount: 4000 }].span());
    assert_eq!(s.vault.match_state('m1'), match_state::OPEN);
    assert_eq!(s.vault.locked(s.token), 4000);
    assert_eq!(s.vault.free_balance(s.token), 6000);
    // 5% of 4000 = 200: the most the house may take
    s.vault.settle_match('m1', array![TokenAmount { token: s.token, amount: 200 }].span(), 'root');
    stop_cheat_caller_address(s.vault.contract_address);
    assert_eq!(s.vault.match_state('m1'), match_state::SETTLED);
    assert!(s.vault.locked(s.token).is_zero());
    assert_eq!(s.vault.free_balance(s.token), 9800);
    assert_eq!(balance(s.token, treasury()), 200);
}

#[test]
#[should_panic(expected: 'VAULT: rake above the cap')]
fn rake_over_five_percent_is_refused() {
    let s = setup();
    deposit(@s, 10_000, 'ref-1');
    start_cheat_caller_address(s.vault.contract_address, house());
    s.vault.open_match('m1', array![TokenAmount { token: s.token, amount: 4000 }].span());
    s.vault.settle_match('m1', array![TokenAmount { token: s.token, amount: 201 }].span(), 'root');
}

#[test]
fn void_releases_the_pot() {
    let s = setup();
    deposit(@s, 1000, 'ref-1');
    start_cheat_caller_address(s.vault.contract_address, house());
    s.vault.open_match('m1', array![TokenAmount { token: s.token, amount: 1000 }].span());
    s.vault.void_match('m1');
    assert_eq!(s.vault.free_balance(s.token), 1000);
    assert_eq!(s.vault.match_state('m1'), match_state::VOIDED);
}

#[test]
#[should_panic(expected: 'VAULT: not the operator')]
fn only_the_operator_opens_matches() {
    let s = setup();
    deposit(@s, 1000, 'ref-1');
    s.vault.open_match('m1', array![TokenAmount { token: s.token, amount: 100 }].span());
}

#[test]
#[should_panic(expected: 'VAULT: match already exists')]
fn a_match_opens_once() {
    let s = setup();
    deposit(@s, 1000, 'ref-1');
    start_cheat_caller_address(s.vault.contract_address, house());
    s.vault.open_match('m1', array![TokenAmount { token: s.token, amount: 100 }].span());
    s.vault.open_match('m1', array![TokenAmount { token: s.token, amount: 100 }].span());
}

#[test]
fn operator_sweeps_free_funds_to_the_house() {
    let s = setup();
    deposit(@s, 1000, 'ref-1');
    start_cheat_caller_address(s.vault.contract_address, house());
    s.vault.sweep(s.token, 400);
    assert_eq!(balance(s.token, house()), 400);
    assert_eq!(s.vault.free_balance(s.token), 600);
}

#[test]
#[should_panic(expected: 'VAULT: paused')]
fn paused_vault_refuses_deposits() {
    let s = setup();
    start_cheat_caller_address(s.vault.contract_address, owner());
    s.vault.set_paused(true);
    stop_cheat_caller_address(s.vault.contract_address);
    deposit(@s, 1000, 'ref-1');
}

// the server signs this exact hash (server/cashier/vault.js payoutHash; test/vault.test.js
// checks the same value from JavaScript)
#[test]
fn payout_hash_matches_the_server() {
    let key = KeyPairTrait::<felt252, felt252>::from_secret_key(OPERATOR_SECRET);
    let vault_class = declare("DarkBagsVault").unwrap().contract_class();
    let pool: ContractAddress = 'pool'.try_into().unwrap();
    let at: ContractAddress = 0x1234.try_into().unwrap();
    let (vault, _) = vault_class
        .deploy_at(
            @array![pool.into(), owner().into(), house().into(), key.public_key, treasury().into()],
            at,
        )
        .unwrap();
    let token: ContractAddress = 0x777.try_into().unwrap();
    let notes = array![
        OpenNoteDeposit { note_id: 0xaaa, token, amount: 3000 },
        OpenNoteDeposit { note_id: 0xbbb, token, amount: 1500 },
    ];
    let h = IDarkBagsVaultDispatcher { contract_address: vault }.payout_hash(0x99, token, notes.span());
    assert_eq!(h, 0x655852042aa9f71d5d860106fcc0470b682d78bac5ad2bb83a64cee76c50f09);
}
