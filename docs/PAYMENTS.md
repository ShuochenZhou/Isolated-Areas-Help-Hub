# WeChat Pay production lifecycle

The paid path uses the official WeChat Pay API v3 Java SDK (`com.github.wechatpay-apiv3:wechatpay-java:0.2.17`). It is not a client-side payment simulation. The SDK signs merchant requests, verifies responses, validates callback signatures, and decrypts callback resources. Official SDK and callback guidance: <https://github.com/wechatpay-apiv3/wechatpay-java>.

## Commercial model

Each inventory item stores `unit_price_fen`. A value of zero means the item is fully subsidized; a positive value is the resident price in CNY fen. The server multiplies this stored price by the reserved quantity. The WeChat application never supplies or overrides the charged amount.

## Payment state machine

1. A resident reserves matching approved inventory. MySQL locks the inventory row, holds stock, and creates a 30-minute reservation.
2. For a priced item, `POST /api/resident/payments` creates one merchant order per reservation and calls JSAPI prepay with the authenticated resident's WeChat `openid`.
3. The server returns the SDK-generated `timeStamp`, `nonceStr`, `package`, `signType`, and `paySign`; the WeChat application passes them to `wx.requestPayment`.
4. Client success is not treated as payment. Only `POST /api/payments/wechat/notify` can change the order to `SUCCESS`. The SDK verifies/decrypts the raw callback, and the service checks AppID, merchant ID, order number, amount, currency, and payer openid before confirming the reservation.
5. Missing callbacks are recovered by querying WeChat before expired local orders are closed. A payment arriving after its reservation expired is detected and scheduled for a compensating full refund.
6. Resident or administrator refunds create a unique refund order through API v3. Stock is released only after a verified `refund-notify` callback reports `SUCCESS`; repeated callbacks are idempotent.
7. If a refund request has an ambiguous network result, the server preserves the same refund number and queries WeChat with exponential backoff; it never creates a second refund number for that request.

## Required merchant configuration

Set all of these server-only values:

```text
WECHAT_APP_ID
WECHAT_APP_SECRET
WECHAT_PAY_MERCHANT_ID
WECHAT_PAY_MERCHANT_SERIAL
WECHAT_PAY_PRIVATE_KEY_PATH
WECHAT_PAY_API_V3_KEY
WECHAT_PAY_NOTIFY_URL=https://your-api.example/api/payments/wechat/notify
WECHAT_PAY_REFUND_NOTIFY_URL=https://your-api.example/api/payments/wechat/refund-notify
```

The callback URLs must use a publicly trusted HTTPS certificate and return HTTP 200 only after the database transaction commits. Do not expose the merchant PEM or API v3 key through Docker build arguments, source control, the admin bundle, or the WeChat application.

## Launch acceptance test

1. In the WeChat merchant console, bind the approved WeChat application AppID and configure the API v3 key and merchant API certificate.
2. Set one non-production catalog item to one fen and reserve it with a real WeChat test account.
3. Confirm that `wx.requestPayment` charges exactly one fen, the callback changes `payment_orders.status` to `SUCCESS`, and only then does the reservation expose its pickup code.
4. Replay the identical payment callback; stock and accounting must not change twice.
5. Request a refund, wait for the verified refund callback, and confirm the order is `REFUNDED`, the reservation is `CANCELLED`, and held inventory is restored once.
6. Compare the merchant console order/refund IDs with the admin payment page and retain the acceptance evidence. Do not claim live payment support until this test passes with the production merchant account.
