//! Test doubles: a plain ERC20 and a stand-in for the STRK20 pool that applies an invoke the way
//! the real pool does (`_apply_invoke_and_deposits` in starkware-libs/starknet-privacy): call
//! `privacy_invoke`, then pull every returned deposit from the invoked contract with
//! `transfer_from`. Never deployed outside tests.

use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockToken<T> {
    fn mint(ref self: T, to: ContractAddress, amount: u256);
}

#[starknet::contract]
pub mod MockToken {
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};
    use crate::vault::IERC20;

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
    }

    #[abi(embed_v0)]
    impl TokenImpl of IERC20<ContractState> {
        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.read(account)
        }
        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            let from = get_caller_address();
            self._move(from, recipient, amount);
            true
        }
        fn transfer_from(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            let spender = get_caller_address();
            let allowed = self.allowances.read((sender, spender));
            assert(allowed >= amount, 'ERC20: allowance');
            self.allowances.write((sender, spender), allowed - amount);
            self._move(sender, recipient, amount);
            true
        }
        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            self.allowances.write((get_caller_address(), spender), amount);
            true
        }
    }

    #[abi(embed_v0)]
    impl MintImpl of super::IMockToken<ContractState> {
        fn mint(ref self: ContractState, to: ContractAddress, amount: u256) {
            self.balances.write(to, self.balances.read(to) + amount);
        }
    }

    #[generate_trait]
    impl Internal of InternalTrait {
        fn _move(ref self: ContractState, from: ContractAddress, to: ContractAddress, amount: u256) {
            let have = self.balances.read(from);
            assert(have >= amount, 'ERC20: balance');
            self.balances.write(from, have - amount);
            self.balances.write(to, self.balances.read(to) + amount);
        }
    }
}

#[starknet::interface]
pub trait IMockPool<T> {
    /// A private tx with a Withdraw to `target` (optional, amount 0 = none) followed by an Invoke.
    fn withdraw_and_invoke(
        ref self: T,
        token: ContractAddress,
        amount: u128,
        target: ContractAddress,
        calldata: Span<felt252>,
    ) -> Span<crate::vault::OpenNoteDeposit>;
    /// Total each open note received (what the player's shielded balance would show).
    fn note_balance(self: @T, note_id: felt252) -> u128;
}

#[starknet::contract]
pub mod MockPool {
    use core::num::traits::Zero;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use starknet::syscalls::call_contract_syscall;
    use starknet::{ContractAddress, SyscallResultTrait, get_contract_address};
    use crate::vault::{IERC20Dispatcher, IERC20DispatcherTrait, OpenNoteDeposit};

    #[storage]
    struct Storage {
        notes: Map<felt252, u128>,
    }

    #[abi(embed_v0)]
    impl PoolImpl of super::IMockPool<ContractState> {
        fn withdraw_and_invoke(
            ref self: ContractState,
            token: ContractAddress,
            amount: u128,
            target: ContractAddress,
            calldata: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            if amount.is_non_zero() {
                IERC20Dispatcher { contract_address: token }.transfer(target, amount.into());
            }
            let mut ret = call_contract_syscall(target, selector!("privacy_invoke"), calldata)
                .unwrap_syscall();
            let deposits: Span<OpenNoteDeposit> = Serde::deserialize(ref ret).unwrap();
            for d in deposits {
                assert(self.notes.read(*d.note_id).is_zero(), 'POOL: note already deposited');
                IERC20Dispatcher { contract_address: *d.token }
                    .transfer_from(target, get_contract_address(), (*d.amount).into());
                self.notes.write(*d.note_id, *d.amount);
            }
            deposits
        }

        fn note_balance(self: @ContractState, note_id: felt252) -> u128 {
            self.notes.read(note_id)
        }
    }
}
