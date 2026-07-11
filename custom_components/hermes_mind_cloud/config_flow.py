from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries

from .const import DEFAULT_HERMES_PATH, DOMAIN


class HermesMindCloudConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(
                title="Hermes Mind Cloud",
                data={"hermes_path": user_input["hermes_path"]},
            )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {vol.Required("hermes_path", default=DEFAULT_HERMES_PATH): str}
            ),
        )
