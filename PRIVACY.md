# Privacy Policy for Favewise

*Last Updated: May 9, 2026*

Favewise is designed to help users manage bookmarks in their browser (Chrome, Edge, Firefox, and compatible browsers). This extension may process bookmark data such as bookmark titles, URLs, folder structure, timestamps, and related user actions in order to provide its core features.

This Privacy Policy describes what data Favewise may access, how it is used, when it may be shared, and what choices users have. This policy should be read together with the user-facing project overview in [README.md](./README.md).

## 1. Data We May Access

Depending on the features you use, Favewise may access or process:

- bookmark titles
- bookmark URLs
- bookmark folder names and hierarchy
- bookmark metadata made available by the browser
- user-initiated actions within the extension interface

Favewise is not intended to collect unrelated browsing activity outside the features presented to the user.

## 2. Core Local Processing

By default, Favewise performs core bookmark management functions locally on the user's device. These core functions may include:

- local bookmark sync
- link checking
- duplicate detection
- folder analysis
- cleanup suggestions

Where a feature operates locally, bookmark data used for that feature is not intentionally transmitted to JoyX-operated servers merely to provide that local function.

For link checking, the extension may make direct requests from the browser extension context to the bookmarked sites in order to classify reachability, redirects, timeouts, or authentication-related responses. Those requests occur only when the user starts a link check, and are not intended as unrelated tracking. Scheduled scans refresh local bookmark analysis only; they do not start new link-check network requests. Favewise skips local, private, and non-HTTP(S) URLs by default.

Favewise does not inject scripts into webpages, does not read webpage DOM content, and does not upload bookmark data to JoyX-operated servers.

## 3. No Remote Data Processing

In the current public release, Favewise does not send bookmark data to JoyX-operated servers. All bookmark analysis, clustering, and cleanup features run locally on the user's device, except for the user-requested link-check requests to bookmarked sites described above.

If a future version introduces remote processing, this policy and the relevant store disclosures should be updated before that feature is released, and the feature should clearly explain what data is sent and why.

## 4. JoyX and Ownership Roles

JoyX may act as the operating, promotional, or distribution entity for Favewise. Copyright and IP ownership roles are described in [COPYRIGHT.md](./COPYRIGHT.md).

Unless otherwise expressly stated, this Privacy Policy does not mean JoyX owns the source code or all underlying intellectual property rights in the project.

## 5. Data Sharing

Favewise may share data only in the following situations:

- when required by applicable law, regulation, legal process, or enforceable governmental request
- when reasonably necessary to investigate security incidents, abuse, fraud, or misuse
- as part of a merger, acquisition, financing transaction, reorganization, sale of assets, or transfer of the project, where legally permitted and subject to applicable obligations

Favewise does not sell personal data, bookmark history, or user content to data brokers, advertisers, or advertising networks.

## 6. Data Retention

Favewise is intended to minimize retention of user bookmark data.

- local processing data generally remains on the user's device unless the user exports, syncs, or transmits it
- if a future optional remote feature is introduced, temporary retention may occur as required to complete the request, operate the service, meet security needs, or comply with legal obligations

Retention periods may change as the product evolves. Material changes should be reflected in an updated version of this policy.

## 7. Security

Favewise is intended to use reasonable administrative, technical, and organizational measures to protect data handled by the extension. However, no software, browser environment, local device, network transmission, or third-party API can be guaranteed to be completely secure.

Users remain responsible for:

- protecting access to their browser profile and devices
- backing up bookmarks before making material cleanup changes
- reviewing protected, login-gated, campus, SSO, CAS, or VPN-related bookmarks before deleting them based on automated classification

## 8. User Choices

Users may:

- remove the extension at any time
- stop using specific features
- manage or delete local browser bookmark data through browser tools

## 9. No Personalized Advertising Use

Favewise does not use bookmark data or related user data for personalized, interest-based, or retargeted advertising.

## 10. Chrome Web Store Limited Use

Favewise's use of information received from Chrome and Google extension APIs will adhere to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq/), including the Limited Use requirements.

In the current public release, JoyX does not receive bookmark titles, bookmark URLs, or bookmark history on JoyX-operated servers. If a future version introduces a remote feature that receives user data, the feature, store disclosure, and this policy must be updated before release.

## 11. Policy Changes

This Privacy Policy may be updated from time to time to reflect changes in features, data practices, legal requirements, or operational structure. The "Last Updated" date above will be revised when material changes are made.

## 12. Contact

Privacy inquiries may be sent to: `privacy@joyx.io`

For product information, see:

- [README.md](./README.md)
- [COPYRIGHT.md](./COPYRIGHT.md)

For legal or rights-related matters that are not privacy-specific, the project may publish a separate legal contact in the future.
