import axios, { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./index";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const refreshed = (token: string) => ({ data: { access_token: token } }) as AxiosResponse<{ access_token: string }>;

function makeClient() {
  let token: string | null = null;
  const client = createApiClient({
    platform: "test",
    appVersion: "0.0.0",
    getToken: () => token,
    setToken: (t) => {
      token = t;
    },
  });
  return { client, getToken: () => token };
}

describe("refreshSession", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shares one request between overlapping callers", async () => {
    const pending = deferred<AxiosResponse<{ access_token: string }>>();
    const post = vi.spyOn(axios, "post").mockReturnValue(pending.promise);
    const { client } = makeClient();

    const first = client.refreshSession();
    const second = client.refreshSession();
    pending.resolve(refreshed("new-token"));

    await expect(Promise.all([first, second])).resolves.toEqual(["new-token", "new-token"]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("sends a new request once the previous one has settled", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValueOnce(refreshed("a")).mockResolvedValueOnce(refreshed("b"));
    const { client } = makeClient();

    await expect(client.refreshSession()).resolves.toBe("a");
    await expect(client.refreshSession()).resolves.toBe("b");
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("rejects every overlapping caller and allows a retry after a failure", async () => {
    const pending = deferred<AxiosResponse<{ access_token: string }>>();
    const post = vi.spyOn(axios, "post").mockReturnValueOnce(pending.promise).mockResolvedValueOnce(refreshed("later"));
    const { client } = makeClient();

    const first = client.refreshSession();
    const second = client.refreshSession();
    pending.reject(new Error("refresh failed"));

    await expect(first).rejects.toThrow("refresh failed");
    await expect(second).rejects.toThrow("refresh failed");
    await expect(client.refreshSession()).resolves.toBe("later");
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("is joined by a 401 retry that arrives during session restore", async () => {
    const pending = deferred<AxiosResponse<{ access_token: string }>>();
    const post = vi.spyOn(axios, "post").mockReturnValue(pending.promise);
    const { client, getToken } = makeClient();

    const seen: (string | undefined)[] = [];
    const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      const auth = config.headers.get("Authorization");
      seen.push(typeof auth === "string" ? auth : undefined);
      const response = { data: {}, headers: {}, config, statusText: "", status: auth ? 200 : 401 };
      if (!auth) throw new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, null, response);
      return response;
    };
    client.defaults.adapter = adapter;

    const restore = client.refreshSession();
    const request = client.get("/orders");
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    pending.resolve(refreshed("new-token"));

    await expect(restore).resolves.toBe("new-token");
    await expect(request).resolves.toMatchObject({ status: 200 });
    expect(seen).toEqual([undefined, "Bearer new-token"]);
    expect(getToken()).toBe("new-token");
    expect(post).toHaveBeenCalledTimes(1);
  });
});
