import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Address,
  AddressInput,
  BranchesResponse,
  Cart,
  CartAddRequest,
  CreateOrderRequest,
  CreatedOrder,
  CustomerOrderDetail,
  PriceBreakdown,
  CalculatePriceRequest,
  ProductsResponse,
} from "@2m/shared";
import { api } from "./api";
import { TERMINAL_STATUSES } from "@2m/shared";

export const useBranches = () =>
  useQuery({ queryKey: ["branches"], queryFn: async () => (await api.get<BranchesResponse>("/branches")).data.branches });

export const useProducts = (branchId: string, category: string | undefined, q: string, page: number) =>
  useQuery({
    queryKey: ["products", branchId, category, q, page],
    queryFn: async () =>
      (await api.get<ProductsResponse>(`/branches/${branchId}/products`, { params: { category, q: q || undefined, page } }))
        .data,
    placeholderData: (prev) => prev,
  });

export const useCart = (branchId: string, enabled = true) =>
  useQuery({
    queryKey: ["cart", branchId],
    queryFn: async () => (await api.get<Cart>("/cart", { params: { branch_id: branchId } })).data,
    enabled,
  });

export function useCartMutations(branchId: string) {
  const qc = useQueryClient();
  const onSuccess = (cart: Cart) => qc.setQueryData(["cart", branchId], cart);
  return {
    add: useMutation({
      mutationFn: async (input: Omit<CartAddRequest, "branch_id">) =>
        (await api.post<Cart>("/cart/items", { ...input, branch_id: branchId })).data,
      onSuccess,
    }),
    setQty: useMutation({
      mutationFn: async (v: { productId: string; qty: number }) =>
        (await api.patch<Cart>(`/cart/items/${v.productId}`, { branch_id: branchId, qty: v.qty })).data,
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: async (productId: string) =>
        (await api.delete<Cart>(`/cart/items/${productId}`, { params: { branch_id: branchId } })).data,
      onSuccess,
    }),
  };
}

export const useAddresses = () =>
  useQuery({
    queryKey: ["addresses"],
    queryFn: async () => (await api.get<{ addresses: Address[] }>("/addresses")).data.addresses,
  });

export function useAddressMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["addresses"] });
  return {
    create: useMutation({
      mutationFn: async (input: AddressInput) => (await api.post<{ address: Address }>("/addresses", input)).data.address,
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: async (v: { id: string; input: AddressInput }) =>
        (await api.put<{ address: Address }>(`/addresses/${v.id}`, v.input)).data.address,
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        await api.delete(`/addresses/${id}`);
      },
      onSuccess: invalidate,
    }),
  };
}

export const useQuote = (req: CalculatePriceRequest | null) =>
  useQuery({
    queryKey: ["quote", req],
    queryFn: async () => (await api.post<PriceBreakdown>("/calculate-price", req)).data,
    enabled: req !== null,
    retry: false,
  });

export function useCreateOrder(branchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: CreateOrderRequest) => (await api.post<{ order: CreatedOrder }>("/orders", req)).data.order,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cart", branchId] }),
  });
}

export const useOrder = (id: string, pollMs = 10_000) =>
  useQuery({
    queryKey: ["order", id],
    queryFn: async () => (await api.get<{ order: CustomerOrderDetail }>(`/orders/${id}`)).data.order,
    refetchInterval: (query) =>
      query.state.data && TERMINAL_STATUSES.includes(query.state.data.status) ? false : pollMs,
  });
