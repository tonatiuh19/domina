import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";
import type { Course, EnrollmentStatus, PaymentMethod } from "@shared/api";
import { authHeaders, formatAxiosError } from "@/lib/api";
import type { RootState } from "../index";

export type OxxoVoucherPayload = {
  url: string;
  reference: string | null;
  expiresAt: number | null;
  amountCents: number;
  currency: string;
  courseTitle: string;
};

export type TransferInstructionsPayload = {
  status: "pending_transfer";
  enrollmentId: number;
  paymentId: number;
  reference: string;
  expiresAt: string;
  amountCents: number;
  currency: string;
  bank: {
    bankName: string;
    accountHolder: string;
    clabe: string;
    accountNumber: string | null;
    bankCode: string | null;
    instructions: string | null;
  };
};

export type PortalCoupon = {
  id: number;
  code: string;
  name: string;
  discountType: "percent" | "fixed";
  percentOff: number | null;
  amountOffCents: number | null;
  listAmountCents: number;
  discountCents: number;
  finalAmountCents: number;
};

export interface PortalEnrollment {
  id: number;
  editionId: number;
  status: EnrollmentStatus;
  amountCents: number;
  currency: string;
  listAmountCents?: number | null;
  discountCents?: number;
  couponId?: number | null;
  coupon?: PortalCoupon | null;
  paymentMethod: PaymentMethod | null;
  cardBrand: string | null;
  cardLast4: string | null;
  title: string;
  slug: string;
  promise: string;
  category: string;
  coverImageUrl: string | null;
  startsAt: string;
  endsAt: string;
  venueName: string;
  city: string;
  editionStatus: string;
  transfer?: TransferInstructionsPayload | null;
}

interface PortalState {
  enrollments: PortalEnrollment[];
  activeEnrollment: PortalEnrollment | null;
  recommendations: Course[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  errorCode: string | null;
  clientSecret: string | null;
  oxxoSessionId: string | null;
  oxxoVoucher: OxxoVoucherPayload | null;
  oxxoEmailSending: boolean;
  oxxoEmailSent: boolean;
  oxxoEmailError: string | null;
  transfer: TransferInstructionsPayload | null;
}

const initialState: PortalState = {
  enrollments: [],
  activeEnrollment: null,
  recommendations: [],
  loading: false,
  saving: false,
  error: null,
  errorCode: null,
  clientSecret: null,
  oxxoSessionId: null,
  oxxoVoucher: null,
  oxxoEmailSending: false,
  oxxoEmailSent: false,
  oxxoEmailError: null,
  transfer: null,
};

function upsertEnrollment(list: PortalEnrollment[], enrollment: PortalEnrollment) {
  const index = list.findIndex((item) => item.id === enrollment.id);
  if (index === -1) return [enrollment, ...list];
  const next = list.slice();
  next[index] = enrollment;
  return next;
}

export const fetchEnrollments = createAsyncThunk("portal/enrollments", async (_, { getState, rejectWithValue }) => {
  try {
    const token = (getState() as RootState).userAuth.token;
    const { data } = await axios.get("/api/portal/enrollments", { headers: authHeaders(token) });
    return data.enrollments as PortalEnrollment[];
  } catch (error) {
    return rejectWithValue(formatAxiosError(error));
  }
});

export const fetchEnrollment = createAsyncThunk(
  "portal/enrollment",
  async (enrollmentId: number, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).userAuth.token;
      const { data } = await axios.get(`/api/portal/enrollments/${enrollmentId}`, {
        headers: authHeaders(token),
      });
      return data.enrollment as PortalEnrollment;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return rejectWithValue({ code: "not_found", message: formatAxiosError(error) });
      }
      return rejectWithValue({ code: "load_failed", message: formatAxiosError(error) });
    }
  },
);

export const fetchRecommendations = createAsyncThunk(
  "portal/recommendations",
  async (_, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).userAuth.token;
      const { data } = await axios.get("/api/portal/recommendations", { headers: authHeaders(token) });
      return data.courses as Course[];
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const reserveSeat = createAsyncThunk(
  "portal/reserve",
  async (editionId: number, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).userAuth.token;
      const { data } = await axios.post("/api/portal/enrollments", { editionId }, { headers: authHeaders(token) });
      return data as { enrollmentId: number; resumed?: boolean; alreadyPaid?: boolean };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const startCheckout = createAsyncThunk(
  "portal/checkout",
  async (
    input: number | { enrollmentId: number; preferStripe?: boolean },
    { getState, rejectWithValue },
  ) => {
    try {
      const enrollmentId = typeof input === "number" ? input : input.enrollmentId;
      const preferStripe = typeof input === "number" ? false : Boolean(input.preferStripe);
      const token = (getState() as RootState).userAuth.token;
      const { data } = await axios.post(
        "/api/portal/checkout",
        { enrollmentId, preferStripe: preferStripe || undefined },
        { headers: authHeaders(token) },
      );
      if (data?.status === "pending_oxxo") {
        return data as { status: "pending_oxxo"; enrollmentId: number; sessionId?: string | null };
      }
      if (data?.status === "pending_transfer") {
        return data as TransferInstructionsPayload;
      }
      return data as { clientSecret: string; sessionId?: string; reused?: boolean };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const code = error.response?.data?.code;
        if (typeof code === "string") {
          return rejectWithValue({ code, message: formatAxiosError(error) });
        }
      }
      return rejectWithValue({ code: "checkout_failed", message: formatAxiosError(error) });
    }
  },
);

export const startTransfer = createAsyncThunk(
  "portal/startTransfer",
  async (enrollmentId: number, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).userAuth.token;
      const { data } = await axios.post(
        "/api/portal/checkout/transfer",
        { enrollmentId },
        { headers: authHeaders(token) },
      );
      return data as TransferInstructionsPayload;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const code = error.response?.data?.code;
        if (typeof code === "string") {
          return rejectWithValue({ code, message: formatAxiosError(error) });
        }
      }
      return rejectWithValue({ code: "transfer_failed", message: formatAxiosError(error) });
    }
  },
);

export const confirmCheckout = createAsyncThunk(
  "portal/confirmCheckout",
  async (sessionId: string, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).userAuth.token;
      const { data } = await axios.post(
        "/api/portal/checkout/confirm",
        { sessionId },
        { headers: authHeaders(token) },
      );
      return data as {
        status: "paid" | "pending_oxxo";
        enrollmentId: number;
        sessionId?: string;
        voucher?: OxxoVoucherPayload | null;
      };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const emailOxxoVoucher = createAsyncThunk(
  "portal/emailOxxoVoucher",
  async (body: { enrollmentId: number; sessionId?: string }, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).userAuth.token;
      const { data } = await axios.post("/api/portal/checkout/oxxo-email", body, {
        headers: authHeaders(token),
      });
      return data as { ok: boolean; skipped?: boolean; sessionId?: string };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const fetchOxxoVoucher = createAsyncThunk(
  "portal/fetchOxxoVoucher",
  async (body: { enrollmentId: number; sessionId?: string }, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).userAuth.token;
      const { data } = await axios.post("/api/portal/checkout/oxxo-voucher", body, {
        headers: authHeaders(token),
      });
      return data as { sessionId?: string; voucher: OxxoVoucherPayload };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const sendFeedback = createAsyncThunk(
  "portal/feedback",
  async (body: { enrollmentId: number; rating: number; comment?: string }, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).userAuth.token;
      await axios.post("/api/portal/feedback", body, { headers: authHeaders(token) });
      return true;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const applyCoupon = createAsyncThunk(
  "portal/applyCoupon",
  async (body: { enrollmentId: number; code: string }, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).userAuth.token;
      const { data } = await axios.post("/api/portal/checkout/coupon", body, {
        headers: authHeaders(token),
      });
      return data as {
        enrollmentId: number;
        amountCents: number;
        listAmountCents: number;
        discountCents: number;
        currency: string;
        free: boolean;
        coupon: PortalCoupon;
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const code = error.response?.data?.code;
        if (typeof code === "string") {
          return rejectWithValue({ code, message: formatAxiosError(error) });
        }
      }
      return rejectWithValue({ code: "coupon_failed", message: formatAxiosError(error) });
    }
  },
);

export const removeCoupon = createAsyncThunk(
  "portal/removeCoupon",
  async (enrollmentId: number, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).userAuth.token;
      const { data } = await axios.delete("/api/portal/checkout/coupon", {
        headers: authHeaders(token),
        data: { enrollmentId },
      });
      return data as {
        enrollmentId: number;
        amountCents: number;
        listAmountCents: null;
        discountCents: number;
        coupon: null;
        removed: boolean;
      };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const confirmFreeCheckout = createAsyncThunk(
  "portal/confirmFreeCheckout",
  async (enrollmentId: number, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).userAuth.token;
      const { data } = await axios.post(
        "/api/portal/checkout/confirm-free",
        { enrollmentId },
        { headers: authHeaders(token) },
      );
      return data as { enrollmentId: number; status: "paid"; newlyPaid: boolean };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const code = error.response?.data?.code;
        if (typeof code === "string") {
          return rejectWithValue({ code, message: formatAxiosError(error) });
        }
      }
      return rejectWithValue({ code: "confirm_free_failed", message: formatAxiosError(error) });
    }
  },
);

const portalSlice = createSlice({
  name: "portal",
  initialState,
  reducers: {
    clearPortalError(state) {
      state.error = null;
      state.errorCode = null;
    },
    clearCheckout(state) {
      state.clientSecret = null;
      state.error = null;
      state.errorCode = null;
      state.activeEnrollment = null;
      state.oxxoSessionId = null;
      state.oxxoVoucher = null;
      state.oxxoEmailSending = false;
      state.oxxoEmailSent = false;
      state.oxxoEmailError = null;
      state.transfer = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEnrollments.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(fetchEnrollments.fulfilled, (state, action) => {
        state.loading = false;
        state.enrollments = action.payload;
        if (state.activeEnrollment) {
          const refreshed = action.payload.find((item) => item.id === state.activeEnrollment?.id);
          if (refreshed) state.activeEnrollment = refreshed;
        }
      })
      .addCase(fetchEnrollments.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload || "");
      })
      .addCase(fetchEnrollment.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(fetchEnrollment.fulfilled, (state, action) => {
        state.loading = false;
        state.activeEnrollment = action.payload;
        state.enrollments = upsertEnrollment(state.enrollments, action.payload);
        if (action.payload.transfer) state.transfer = action.payload.transfer;
      })
      .addCase(fetchEnrollment.rejected, (state, action) => {
        state.loading = false;
        const payload = action.payload as { code?: string; message?: string } | undefined;
        state.error = payload?.message || String(action.payload || "");
        state.errorCode = payload?.code || "load_failed";
        state.activeEnrollment = null;
      })
      .addCase(fetchRecommendations.fulfilled, (state, action) => {
        state.recommendations = action.payload;
      })
      .addCase(reserveSeat.pending, (state) => {
        state.saving = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(reserveSeat.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(reserveSeat.rejected, (state, action) => {
        state.saving = false;
        state.error = String(action.payload || "");
      })
      .addCase(startCheckout.pending, (state) => {
        state.saving = true;
        state.error = null;
        state.errorCode = null;
        state.clientSecret = null;
      })
      .addCase(startCheckout.fulfilled, (state, action) => {
        state.saving = false;
        const payload = action.payload;
        if ("status" in payload && payload.status === "pending_oxxo") {
          state.clientSecret = null;
          const enrollmentId = payload.enrollmentId;
          if (payload.sessionId) state.oxxoSessionId = payload.sessionId;
          if (state.activeEnrollment?.id === enrollmentId) {
            state.activeEnrollment = { ...state.activeEnrollment, paymentMethod: "oxxo" };
            state.enrollments = upsertEnrollment(state.enrollments, state.activeEnrollment);
          } else {
            const existing = state.enrollments.find((item) => item.id === enrollmentId);
            if (existing) {
              const updated = { ...existing, paymentMethod: "oxxo" as const };
              state.enrollments = upsertEnrollment(state.enrollments, updated);
            }
          }
          return;
        }
        if ("status" in payload && payload.status === "pending_transfer") {
          state.clientSecret = null;
          state.transfer = payload;
          if (state.activeEnrollment?.id === payload.enrollmentId) {
            state.activeEnrollment = {
              ...state.activeEnrollment,
              paymentMethod: "transfer",
              transfer: payload,
            };
            state.enrollments = upsertEnrollment(state.enrollments, state.activeEnrollment);
          }
          return;
        }
        if ("clientSecret" in payload) {
          state.clientSecret = payload.clientSecret;
          state.transfer = null;
          // Fresh session after an OXXO voucher — unlock seat so UI shows payment methods.
          if (
            state.activeEnrollment?.paymentMethod === "oxxo" ||
            state.activeEnrollment?.paymentMethod === "transfer"
          ) {
            state.activeEnrollment = {
              ...state.activeEnrollment,
              paymentMethod: null,
              transfer: null,
            };
            state.enrollments = upsertEnrollment(state.enrollments, state.activeEnrollment);
          }
        }
      })
      .addCase(startCheckout.rejected, (state, action) => {
        state.saving = false;
        const payload = action.payload as { code?: string; message?: string } | undefined;
        state.error = payload?.message || String(action.payload || "");
        state.errorCode = payload?.code || "checkout_failed";
        state.clientSecret = null;
      })
      .addCase(startTransfer.pending, (state) => {
        state.saving = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(startTransfer.fulfilled, (state, action) => {
        state.saving = false;
        state.clientSecret = null;
        state.transfer = action.payload;
        if (state.activeEnrollment?.id === action.payload.enrollmentId) {
          state.activeEnrollment = {
            ...state.activeEnrollment,
            paymentMethod: "transfer",
            transfer: action.payload,
          };
          state.enrollments = upsertEnrollment(state.enrollments, state.activeEnrollment);
        }
      })
      .addCase(startTransfer.rejected, (state, action) => {
        state.saving = false;
        const payload = action.payload as { code?: string; message?: string } | undefined;
        state.error = payload?.message || String(action.payload || "");
        state.errorCode = payload?.code || "transfer_failed";
      })
      .addCase(confirmCheckout.fulfilled, (state, action) => {
        if (action.payload.status === "pending_oxxo") {
          const enrollmentId = action.payload.enrollmentId;
          if (action.payload.sessionId) state.oxxoSessionId = action.payload.sessionId;
          if (action.payload.voucher) state.oxxoVoucher = action.payload.voucher;
          if (state.activeEnrollment?.id === enrollmentId) {
            state.activeEnrollment = { ...state.activeEnrollment, paymentMethod: "oxxo" };
            state.enrollments = upsertEnrollment(state.enrollments, state.activeEnrollment);
          }
          state.clientSecret = null;
          state.oxxoEmailSent = true;
        }
      })
      .addCase(confirmCheckout.rejected, (state, action) => {
        state.error = String(action.payload || "");
      })
      .addCase(emailOxxoVoucher.pending, (state) => {
        state.oxxoEmailSending = true;
        state.oxxoEmailError = null;
      })
      .addCase(emailOxxoVoucher.fulfilled, (state, action) => {
        state.oxxoEmailSending = false;
        state.oxxoEmailSent = true;
        if (action.payload.sessionId) state.oxxoSessionId = action.payload.sessionId;
      })
      .addCase(emailOxxoVoucher.rejected, (state, action) => {
        state.oxxoEmailSending = false;
        state.oxxoEmailError = String(action.payload || "");
      })
      .addCase(fetchOxxoVoucher.fulfilled, (state, action) => {
        state.oxxoVoucher = action.payload.voucher;
        if (action.payload.sessionId) state.oxxoSessionId = action.payload.sessionId;
      })
      .addCase(fetchOxxoVoucher.rejected, (state, action) => {
        state.oxxoEmailError = String(action.payload || "");
      })
      .addCase(sendFeedback.rejected, (state, action) => {
        state.error = String(action.payload || "");
      })
      .addCase(applyCoupon.pending, (state) => {
        state.saving = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(applyCoupon.fulfilled, (state, action) => {
        state.saving = false;
        state.clientSecret = null;
        state.transfer = null;
        if (state.activeEnrollment?.id === action.payload.enrollmentId) {
          state.activeEnrollment = {
            ...state.activeEnrollment,
            amountCents: action.payload.amountCents,
            listAmountCents: action.payload.listAmountCents,
            discountCents: action.payload.discountCents,
            couponId: action.payload.coupon.id,
            coupon: action.payload.coupon,
            paymentMethod: null,
            transfer: null,
          };
          state.enrollments = upsertEnrollment(state.enrollments, state.activeEnrollment);
        }
      })
      .addCase(applyCoupon.rejected, (state, action) => {
        state.saving = false;
        const payload = action.payload as { code?: string; message?: string } | undefined;
        state.error = payload?.message || String(action.payload || "");
        state.errorCode = payload?.code || "coupon_failed";
      })
      .addCase(removeCoupon.pending, (state) => {
        state.saving = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(removeCoupon.fulfilled, (state, action) => {
        state.saving = false;
        state.clientSecret = null;
        state.transfer = null;
        if (state.activeEnrollment?.id === action.payload.enrollmentId) {
          state.activeEnrollment = {
            ...state.activeEnrollment,
            amountCents: action.payload.amountCents,
            listAmountCents: null,
            discountCents: 0,
            couponId: null,
            coupon: null,
            paymentMethod: null,
            transfer: null,
          };
          state.enrollments = upsertEnrollment(state.enrollments, state.activeEnrollment);
        }
      })
      .addCase(removeCoupon.rejected, (state, action) => {
        state.saving = false;
        state.error = String(action.payload || "");
      })
      .addCase(confirmFreeCheckout.pending, (state) => {
        state.saving = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(confirmFreeCheckout.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(confirmFreeCheckout.rejected, (state, action) => {
        state.saving = false;
        const payload = action.payload as { code?: string; message?: string } | undefined;
        state.error = payload?.message || String(action.payload || "");
        state.errorCode = payload?.code || "confirm_free_failed";
      });
  },
});

export const { clearPortalError, clearCheckout } = portalSlice.actions;
export default portalSlice.reducer;
